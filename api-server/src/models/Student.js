const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Student name is required'],
            trim: true,
        },
        rollNumber: {
            type: String,
            required: [true, 'Roll number is required'],
            unique: true,
            trim: true,
        },
        section: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Section',
            required: [true, 'Section is required'],
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        hasEmbedding: {
            type: Boolean,
            default: false,
        },
        embeddingStoredAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// Index for fast lookups
studentSchema.index({ section: 1 });
studentSchema.index({ rollNumber: 1 });

module.exports = mongoose.model('Student', studentSchema);
