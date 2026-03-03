const express = require('express');
const Section = require('../models/Section');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// POST /api/sections
router.post('/', adminOnly, async (req, res) => {
    try {
        const section = await Section.create(req.body);
        res.status(201).json(section);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Section already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sections
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.department) filter.department = req.query.department;
        if (req.query.year) filter.year = parseInt(req.query.year);

        const sections = await Section.find(filter).sort({ department: 1, year: 1, name: 1 });
        res.json(sections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sections/:id
router.get('/:id', async (req, res) => {
    try {
        const section = await Section.findById(req.params.id);
        if (!section) return res.status(404).json({ error: 'Section not found' });
        res.json(section);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sections/:id
router.put('/:id', adminOnly, async (req, res) => {
    try {
        const section = await Section.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!section) return res.status(404).json({ error: 'Section not found' });
        res.json(section);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sections/:id
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const section = await Section.findByIdAndDelete(req.params.id);
        if (!section) return res.status(404).json({ error: 'Section not found' });
        res.json({ message: 'Section deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
