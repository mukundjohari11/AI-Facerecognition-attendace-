import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FiCamera, FiTrash2, FiCheck, FiUser, FiArrowRight, FiArrowLeft } from 'react-icons/fi';
import { studentAPI, sectionAPI } from '../api/client';
import { useEffect } from 'react';

const STEPS = ['Details', 'Face Capture', 'Confirm'];

export default function StudentRegister() {
    const [step, setStep] = useState(0);
    const [sections, setSections] = useState([]);
    const [form, setForm] = useState({ name: '', rollNumber: '', section: '', email: '' });
    const [capturedImages, setCapturedImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [createdStudent, setCreatedStudent] = useState(null);
    const webcamRef = useRef(null);

    useEffect(() => {
        sectionAPI.list().then((res) => setSections(res.data)).catch(() => { });
    }, []);

    const handleCapture = useCallback(() => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc && capturedImages.length < 3) {
            setCapturedImages((prev) => [...prev, imageSrc]);
        }
    }, [capturedImages]);

    const removeImage = (index) => {
        setCapturedImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError('');
        try {
            // Step 1: Create student record
            let student = createdStudent;
            if (!student) {
                const res = await studentAPI.create(form);
                student = res.data;
                setCreatedStudent(student);
            }

            // Step 2: Enroll face images
            if (capturedImages.length > 0) {
                const formData = new FormData();
                for (let i = 0; i < capturedImages.length; i++) {
                    const blob = await fetch(capturedImages[i]).then((r) => r.blob());
                    formData.append('images', blob, `face_${i}.jpg`);
                }
                await studentAPI.enrollFace(student._id, formData);
            }

            setSuccess(`${form.name} registered successfully with ${capturedImages.length} face image(s)!`);
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.error || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep(0);
        setForm({ name: '', rollNumber: '', section: '', email: '' });
        setCapturedImages([]);
        setError('');
        setSuccess('');
        setCreatedStudent(null);
    };

    return (
        <div className="register-page">
            <div className="register-container fade-in">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Student Registration
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Register your face for automated attendance
                    </p>
                </div>

                {/* Steps indicator */}
                <div className="register-steps">
                    {STEPS.map((s, i) => (
                        <div key={s} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                            <span className="step-num">{i < step ? '✓' : i + 1}</span>
                            {s}
                        </div>
                    ))}
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {/* Step 0: Details */}
                {step === 0 && (
                    <div className="card fade-in" style={{ maxWidth: 500, margin: '0 auto' }}>
                        <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>
                            <FiUser style={{ marginRight: 8 }} /> Enter Your Details
                        </h3>
                        <div className="form-group">
                            <label className="form-label">Full Name *</label>
                            <input
                                className="form-input"
                                placeholder="e.g. Rahul Sharma"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Roll Number *</label>
                            <input
                                className="form-input"
                                placeholder="e.g. 21CSE0101"
                                value={form.rollNumber}
                                onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Section *</label>
                            <select
                                className="form-select"
                                value={form.section}
                                onChange={(e) => setForm({ ...form, section: e.target.value })}
                            >
                                <option value="">Select your section</option>
                                {sections.map((s) => (
                                    <option key={s._id} value={s._id}>
                                        {s.name} — {s.department} (Year {s.year})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Email (optional)</label>
                            <input
                                className="form-input"
                                type="email"
                                placeholder="rahul@email.com"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </div>
                        <button
                            className="btn btn-primary btn-lg"
                            style={{ width: '100%', marginTop: '0.5rem' }}
                            disabled={!form.name || !form.rollNumber || !form.section}
                            onClick={() => setStep(1)}
                        >
                            Next: Capture Face <FiArrowRight />
                        </button>
                    </div>
                )}

                {/* Step 1: Face Capture */}
                {step === 1 && (
                    <div className="card fade-in" style={{ maxWidth: 600, margin: '0 auto' }}>
                        <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>
                            <FiCamera style={{ marginRight: 8 }} /> Capture Your Face
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                            Look directly at the camera with good lighting. Capture 1–3 photos from slightly different angles for better accuracy.
                        </p>

                        <div className="webcam-container">
                            <Webcam
                                ref={webcamRef}
                                audio={false}
                                screenshotFormat="image/jpeg"
                                screenshotQuality={0.9}
                                videoConstraints={{
                                    width: 640,
                                    height: 480,
                                    facingMode: 'user',
                                }}
                                style={{ width: '100%', display: 'block' }}
                            />
                            <div className="webcam-overlay">
                                <button
                                    className="capture-btn"
                                    onClick={handleCapture}
                                    disabled={capturedImages.length >= 3}
                                    title="Capture photo"
                                />
                            </div>
                        </div>

                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
                            {capturedImages.length}/3 photos captured
                        </p>

                        {capturedImages.length > 0 && (
                            <div className="captured-images">
                                {capturedImages.map((img, i) => (
                                    <div key={i} className="captured-thumb">
                                        <img src={img} alt={`Capture ${i + 1}`} />
                                        <button className="remove-btn" onClick={() => removeImage(i)}>
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button className="btn btn-outline" onClick={() => setStep(0)}>
                                <FiArrowLeft /> Back
                            </button>
                            <button
                                className="btn btn-success btn-lg"
                                style={{ flex: 1 }}
                                disabled={capturedImages.length === 0 || loading}
                                onClick={handleSubmit}
                            >
                                {loading ? (
                                    <>
                                        <span className="spinner" style={{ width: 18, height: 18 }} />
                                        Registering...
                                    </>
                                ) : (
                                    <>
                                        <FiCheck /> Register ({capturedImages.length} photo{capturedImages.length !== 1 ? 's' : ''})
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Success */}
                {step === 2 && success && (
                    <div className="card fade-in" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Registration Complete!
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                            <strong>{form.name}</strong> ({form.rollNumber})
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>
                            Your face has been enrolled. The system will now recognise you automatically during attendance.
                        </p>
                        <button className="btn btn-primary btn-lg" onClick={reset}>
                            Register Another Student
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
