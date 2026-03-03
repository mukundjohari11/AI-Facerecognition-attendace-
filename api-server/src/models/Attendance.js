const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            required: true,
            default: Date.now,
        },
        sections: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Section',
            },
        ],
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        presentStudents: [
            {
                student: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Student',
                },
                confidence: {
                    type: Number,
                },
            },
        ],
        lowConfidenceMatches: [
            {
                student: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Student',
                },
                confidence: {
                    type: Number,
                },
            },
        ],
        unknownFaces: {
            type: Number,
            default: 0,
        },
        totalDetected: {
            type: Number,
            default: 0,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        approvedAt: {
            type: Date,
        },
        notes: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient querying
attendanceSchema.index({ date: -1, status: 1 });
attendanceSchema.index({ teacher: 1, date: -1 });
attendanceSchema.index({ sections: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
