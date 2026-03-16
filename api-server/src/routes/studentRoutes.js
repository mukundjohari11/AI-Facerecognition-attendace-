const express = require('express');
const multer = require('multer');
const Student = require('../models/Student');
const Section = require('../models/Section');
const mlClient = require('../services/mlClient');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// All routes require auth
router.use(protect);

// POST /api/students — create one student
router.post('/', async (req, res) => {
    try {
        const { name, rollNumber, section, email } = req.body;
        const student = await Student.create({ name, rollNumber, section, email });

        // Update section student count
        await Section.findByIdAndUpdate(section, { $inc: { studentCount: 1 } });

        res.status(201).json(student);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Roll number already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// POST /api/students/bulk — bulk create from JSON array
router.post('/bulk', adminOnly, async (req, res) => {
    try {
        const { students } = req.body; // [{name, rollNumber, section, email}]
        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ error: 'Provide an array of students' });
        }

        const results = { created: 0, errors: [] };

        for (const s of students) {
            try {
                await Student.create(s);
                await Section.findByIdAndUpdate(s.section, { $inc: { studentCount: 1 } });
                results.created++;
            } catch (err) {
                results.errors.push({ rollNumber: s.rollNumber, error: err.message });
            }
        }

        res.status(201).json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/students/:id/enroll-face...upload face images and enroll
router.post('/:id/enroll-face', upload.array('images', 5), async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one image is required' });
        }

        const images = req.files.map((f) => ({
            buffer: f.buffer,
            filename: f.originalname,
        }));
//most important part vector embeddings h ml service mein
        // Call ML service — images are NOT saved to disk (privacy-first)
        const result = await mlClient.enrollStudent(student._id.toString(), images);

        // Update student record
        student.hasEmbedding = true;
        student.embeddingStoredAt = new Date();
        await student.save();

        res.json({
            student: student._id,
            rollNumber: student.rollNumber,
            embeddingsAdded: result.embeddings_added,
            totalIndexSize: result.total_index_size,
        });
    } catch (err) {
        console.error('Face enrollment error:', err.message);
        res.status(500).json({ error: 'Face enrollment failed: ' + err.message });
    }
});

// GET /api/students....list students with optional section filter
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.section) filter.section = req.query.section;
        if (req.query.hasEmbedding) filter.hasEmbedding = req.query.hasEmbedding === 'true';

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const [students, total] = await Promise.all([
            Student.find(filter)
                .populate('section', 'name year department')
                .sort({ rollNumber: 1 })
                .skip(skip)
                .limit(limit),
            Student.countDocuments(filter),
        ]);

        res.json({ students, total, page, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/students/:id
router.get('/:id', async (req, res) => {
    try {
        const student = await Student.findById(req.params.id).populate('section');
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/students/:id
router.put('/:id', async (req, res) => {
    try {
        const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/students/:id
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        // Remove from ML index
        if (student.hasEmbedding) {
            try {
                await mlClient.removeStudent(student._id.toString());
            } catch (mlErr) {
                console.warn('ML removal failed (may not be in index):', mlErr.message);
            }
        }

        await Section.findByIdAndUpdate(student.section, { $inc: { studentCount: -1 } });
        await Student.findByIdAndDelete(req.params.id);

        res.json({ message: 'Student deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
