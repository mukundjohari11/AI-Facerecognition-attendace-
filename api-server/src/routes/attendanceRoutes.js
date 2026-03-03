const express = require('express');
const multer = require('multer');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const mlClient = require('../services/mlClient');
const { protect } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(protect);

// POST /api/attendance/capture — upload one or more classroom images and run recognition
router.post('/capture', upload.array('images', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one classroom image is required' });
        }

        const sectionIds = req.body.sections
            ? JSON.parse(req.body.sections)
            : [];

        // Get student IDs for selected sections (for filtering)
        let sectionStudentIds = [];
        if (sectionIds.length > 0) {
            const students = await Student.find(
                { section: { $in: sectionIds }, hasEmbedding: true },
                '_id'
            );
            sectionStudentIds = students.map((s) => s._id.toString());
        }

        // Send all images to ML service
        const imageFiles = req.files.map((f) => ({
            buffer: f.buffer,
            filename: f.originalname,
        }));

        const mlResult = await mlClient.recognizeFaces(
            imageFiles,
            sectionStudentIds
        );

        // Map ML student_id strings back to ObjectIds and create attendance record
        const presentStudents = mlResult.matches.map((m) => ({
            student: m.student_id,
            confidence: m.confidence,
        }));

        const lowConfidenceMatches = mlResult.low_confidence.map((m) => ({
            student: m.student_id,
            confidence: m.confidence,
        }));

        const attendance = await Attendance.create({
            date: req.body.date || new Date(),
            sections: sectionIds,
            teacher: req.user._id,
            status: 'pending',
            presentStudents,
            lowConfidenceMatches,
            unknownFaces: mlResult.unknown_faces,
            totalDetected: mlResult.total_detected,
        });

        // Populate for response......isko mt chedna
        const populated = await Attendance.findById(attendance._id)
            .populate('presentStudents.student', 'name rollNumber')
            .populate('lowConfidenceMatches.student', 'name rollNumber')
            .populate('sections', 'name year department')
            .populate('teacher', 'name email');

        res.status(201).json(populated);
    } catch (err) {
        console.error('Attendance capture error:', err.message);
        res.status(500).json({ error: 'Attendance capture failed: ' + err.message });
    }
});

// PATCH /api/attendance/:id/approve
router.patch('/:id/approve', async (req, res) => {
    try {
        const { status, notes, addStudents, removeStudents } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be approved or rejected' });
        }

        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) return res.status(404).json({ error: 'Record not found' });

        attendance.status = status;
        attendance.approvedBy = req.user._id;
        attendance.approvedAt = new Date();
        if (notes) attendance.notes = notes;

        // Allow manual edits — add/remove students(human intervention ke liye)
        if (addStudents && addStudents.length > 0) {
            for (const sid of addStudents) {
                if (!attendance.presentStudents.find((p) => p.student.toString() === sid)) {
                    attendance.presentStudents.push({ student: sid, confidence: 1.0 });
                }
            }
        }
        if (removeStudents && removeStudents.length > 0) {
            attendance.presentStudents = attendance.presentStudents.filter(
                (p) => !removeStudents.includes(p.student.toString())
            );
        }

        await attendance.save();

        const populated = await Attendance.findById(attendance._id)
            .populate('presentStudents.student', 'name rollNumber')
            .populate('lowConfidenceMatches.student', 'name rollNumber')
            .populate('sections', 'name year department')
            .populate('teacher', 'name email')
            .populate('approvedBy', 'name email');

        res.json(populated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/attendance — list records with filters
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.date) {
            const day = new Date(req.query.date);
            filter.date = {
                $gte: new Date(day.setHours(0, 0, 0, 0)),
                $lte: new Date(day.setHours(23, 59, 59, 999)),
            };
        }
        if (req.query.section) filter.sections = req.query.section;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.teacher) filter.teacher = req.query.teacher;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [records, total] = await Promise.all([
            Attendance.find(filter)
                .populate('sections', 'name year department')
                .populate('teacher', 'name email')
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit),
            Attendance.countDocuments(filter),
        ]);

        res.json({ records, total, page, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/attendance/:id
router.get('/:id', async (req, res) => {
    try {
        const record = await Attendance.findById(req.params.id)
            .populate('presentStudents.student', 'name rollNumber')
            .populate('lowConfidenceMatches.student', 'name rollNumber')
            .populate('sections', 'name year department')
            .populate('teacher', 'name email')
            .populate('approvedBy', 'name email');

        if (!record) return res.status(404).json({ error: 'Record not found' });
        res.json(record);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/attendance/reports/summary — attendance summary for reports
router.get('/reports/summary', async (req, res) => {
    try {
        const { startDate, endDate, section } = req.query;

        const matchFilter = { status: 'approved' };
        if (startDate || endDate) {
            matchFilter.date = {};
            if (startDate) matchFilter.date.$gte = new Date(startDate);
            if (endDate) matchFilter.date.$lte = new Date(endDate);
        }
        if (section) matchFilter.sections = section;

        const summary = await Attendance.aggregate([
            { $match: matchFilter },
            { $unwind: '$presentStudents' },
            {
                $group: {
                    _id: '$presentStudents.student',
                    totalPresent: { $sum: 1 },
                    avgConfidence: { $avg: '$presentStudents.confidence' },
                },
            },
            {
                $lookup: {
                    from: 'students',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'studentInfo',
                },
            },
            { $unwind: '$studentInfo' },
            {
                $project: {
                    studentId: '$_id',
                    name: '$studentInfo.name',
                    rollNumber: '$studentInfo.rollNumber',
                    totalPresent: 1,
                    avgConfidence: { $round: ['$avgConfidence', 3] },
                },
            },
            { $sort: { rollNumber: 1 } },
        ]);

        const totalSessions = await Attendance.countDocuments(matchFilter);

        res.json({ summary, totalSessions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
