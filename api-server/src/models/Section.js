const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Section name is required'],
            trim: true,
        },
        year: {
            type: Number,
            required: true,
        },
        department: {
            type: String,
            required: true,
            trim: true,
        },
        studentCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

sectionSchema.index({ name: 1, year: 1, department: 1 }, { unique: true });

module.exports = mongoose.model('Section', sectionSchema);
