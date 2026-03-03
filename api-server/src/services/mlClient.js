const axios = require('axios');
const FormData = require('form-data');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/api/ml';

/**
 * Client for communicating with the Python ML service.
 */
const mlClient = {
    /**
     * Send classroom images for recognition.
     * @param {Array<{buffer: Buffer, filename: string}>} imageFiles - Image file buffers
     * @param {string[]} sectionStudentIds - Student IDs to filter by
     * @returns {Promise<object>} Recognition results
     */
    async recognizeFaces(imageFiles, sectionStudentIds = []) {
        const form = new FormData();
        for (const img of imageFiles) {
            form.append('images', img.buffer, {
                filename: img.filename,
                contentType: 'image/jpeg',
            });
        }

        if (sectionStudentIds.length > 0) {
            form.append('section_student_ids', sectionStudentIds.join(','));
        }

        const response = await axios.post(`${ML_SERVICE_URL}/recognize`, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 120000, // 120s for multiple images
        });

        return response.data;
    },

    /**
     * Enroll a student with face images.
     * @param {string} studentId - Student ID
     * @param {Array<{buffer: Buffer, filename: string}>} images - Face images
     * @returns {Promise<object>} Enrollment result
     */
    async enrollStudent(studentId, images) {
        const form = new FormData();
        form.append('student_id', studentId);

        for (const img of images) {
            form.append('images', img.buffer, {
                filename: img.filename,
                contentType: 'image/jpeg',
            });
        }

        const response = await axios.post(`${ML_SERVICE_URL}/enroll`, form, {
            headers: form.getHeaders(),
            timeout: 30000,
        });

        return response.data;
    },

    /**
     * Remove a student from the ML index.
     */
    async removeStudent(studentId) {
        const response = await axios.delete(`${ML_SERVICE_URL}/students/${studentId}`);
        return response.data;
    },

    /**
     * Get ML service health.
     */
    async health() {
        const response = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 5000 });
        return response.data;
    },
};

module.exports = mlClient;
