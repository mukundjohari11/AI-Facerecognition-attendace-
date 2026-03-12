import { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import { FiCamera, FiUpload, FiCheck, FiAlertTriangle, FiTrash2, FiPlus } from 'react-icons/fi';
import { attendanceAPI, sectionAPI } from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function AttendanceCapture() {
    const [sections, setSections] = useState([]);
    const [selectedSections, setSelectedSections] = useState([]);
    const [mode, setMode] = useState('upload'); // 'upload' or 'webcam'
    const [capturedImages, setCapturedImages] = useState([]); // [{preview, blob}]
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const webcamRef = useRef(null);
    const fileRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        sectionAPI.list().then((res) => setSections(res.data)).catch(() => { });
    }, []);

    const toggleSection = (id) => {
        setSelectedSections((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    };

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            if (capturedImages.length >= 5) break;
            setCapturedImages((prev) => [
                ...prev,
                { preview: URL.createObjectURL(file), blob: file },
            ]);
        }
        e.target.value = '';
    };

    const handleWebcamCapture = () => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc && capturedImages.length < 5) {
            fetch(imageSrc)
                .then((r) => r.blob())
                .then((blob) => {
                    setCapturedImages((prev) => [
                        ...prev,
                        { preview: imageSrc, blob },
                    ]);
                });
        }
    };

    const removeImage = (index) => {
        setCapturedImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (capturedImages.length === 0) return;
        setLoading(true);
        setError('');
        try {
            const formData = new FormData();
            capturedImages.forEach((img, i) => {
                formData.append('images', img.blob, `classroom_${i + 1}.jpg`);
            });
            if (selectedSections.length > 0) {
                formData.append('sections', JSON.stringify(selectedSections));
            }
            formData.append('date', new Date().toISOString());

            const res = await attendanceAPI.capture(formData);
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Attendance capture failed');
        } finally {
            setLoading(false);
        }
    };

    const getConfidenceClass = (conf) => {
        if (conf >= 0.65) return 'confidence-high';
        if (conf >= 0.55) return 'confidence-medium';
        return 'confidence-low';
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>📸 Capture Attendance</h2>
                <p>Upload or capture classroom photos to mark attendance</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {!result ? (
                <div className="grid grid-2">
                    {/* Left: Image capture */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Classroom Photos</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className={`btn btn-sm ${mode === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setMode('upload')}
                                >
                                    <FiUpload /> Upload
                                </button>
                                <button
                                    className={`btn btn-sm ${mode === 'webcam' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setMode('webcam')}
                                >
                                    <FiCamera /> Webcam
                                </button>
                            </div>
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                            📷 Upload <strong>1–5 photos</strong> from different angles for best coverage. Faces from all photos are merged automatically.
                        </p>

                        {mode === 'upload' ? (
                            <div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleFileUpload}
                                    style={{ display: 'none' }}
                                />
                                <div
                                    onClick={() => capturedImages.length < 5 && fileRef.current?.click()}
                                    style={{
                                        border: '2px dashed var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '2rem',
                                        textAlign: 'center',
                                        cursor: capturedImages.length >= 5 ? 'not-allowed' : 'pointer',
                                        opacity: capturedImages.length >= 5 ? 0.5 : 1,
                                        transition: 'border-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                                >
                                    <FiPlus style={{ fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }} />
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        {capturedImages.length >= 5 ? 'Maximum 5 photos reached' : 'Click to add classroom photos'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="webcam-container">
                                    <Webcam
                                        ref={webcamRef}
                                        audio={false}
                                        screenshotFormat="image/jpeg"
                                        screenshotQuality={0.9}
                                        videoConstraints={{ width: 1280, height: 720, facingMode: 'user' }}
                                        style={{ width: '100%', display: 'block' }}
                                    />
                                    <div className="webcam-overlay">
                                        <button
                                            className="capture-btn"
                                            onClick={handleWebcamCapture}
                                            disabled={capturedImages.length >= 5}
                                            title="Capture photo"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Image thumbnails */}
                        {capturedImages.length > 0 && (
                            <div style={{ marginTop: '1rem' }}>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    {capturedImages.length}/5 photos added
                                </p>
                                <div className="captured-images">
                                    {capturedImages.map((img, i) => (
                                        <div key={i} className="captured-thumb">
                                            <img src={img.preview} alt={`Photo ${i + 1}`} />
                                            <button className="remove-btn" onClick={() => removeImage(i)}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Section filter & submit */}
                    <div>
                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Select Sections</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                                Filter attendance to specific sections. Leave empty for all students.
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {sections.map((s) => (
                                    <button
                                        key={s._id}
                                        className={`btn btn-sm ${selectedSections.includes(s._id) ? 'btn-primary' : 'btn-outline'}`}
                                        onClick={() => toggleSection(s._id)}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                                {sections.length === 0 && (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        No sections found. Create some in Section Management.
                                    </p>
                                )}
                            </div>
                        </div>

                        <button
                            className="btn btn-success btn-lg"
                            style={{ width: '100%' }}
                            disabled={capturedImages.length === 0 || loading}
                            onClick={handleSubmit}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" style={{ width: 18, height: 18 }} />
                                    Processing {capturedImages.length} photo{capturedImages.length !== 1 ? 's' : ''}...
                                </>
                            ) : (
                                <>
                                    <FiCheck /> Process Attendance ({capturedImages.length} photo{capturedImages.length !== 1 ? 's' : ''})
                                </>
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                /* Results */
                <div className="fade-in">
                    <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
                        <div className="card stat-card">
                            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
                                {result.presentStudents?.length || 0}
                            </div>
                            <div className="stat-label">Matched</div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                                {result.lowConfidenceMatches?.length || 0}
                            </div>
                            <div className="stat-label">Low Confidence</div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-value" style={{ color: 'var(--accent-red)' }}>
                                {result.unknownFaces || 0}
                            </div>
                            <div className="stat-label">Unknown</div>
                        </div>
                    </div>

                    {/* Matched Students */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card-header">
                            <h3 className="card-title"><FiCheck /> Matched Students</h3>
                            <span className="badge badge-success">{result.presentStudents?.length || 0} students</span>
                        </div>
                        {result.presentStudents?.length > 0 ? (
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr><th>Name</th><th>Roll Number</th><th>Confidence</th></tr>
                                    </thead>
                                    <tbody>
                                        {result.presentStudents.map((p, i) => (
                                            <tr key={i}>
                                                <td>{p.student?.name || p.student || '—'}</td>
                                                <td>{p.student?.rollNumber || '—'}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div className="confidence-bar" style={{ width: 80 }}>
                                                            <div
                                                                className={`confidence-fill ${getConfidenceClass(p.confidence)}`}
                                                                style={{ width: `${(p.confidence * 100).toFixed(0)}%` }}
                                                            />
                                                        </div>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            {(p.confidence * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p style={{ color: 'var(--text-muted)' }}>No matches found</p>
                        )}
                    </div>

                    {/* Low confidence */}
                    {result.lowConfidenceMatches?.length > 0 && (
                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <div className="card-header">
                                <h3 className="card-title"><FiAlertTriangle /> Needs Review</h3>
                                <span className="badge badge-warning">{result.lowConfidenceMatches.length}</span>
                            </div>
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr><th>Name</th><th>Roll Number</th><th>Confidence</th></tr>
                                    </thead>
                                    <tbody>
                                        {result.lowConfidenceMatches.map((p, i) => (
                                            <tr key={i}>
                                                <td>{p.student?.name || '—'}</td>
                                                <td>{p.student?.rollNumber || '—'}</td>
                                                <td>{(p.confidence * 100).toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Out-of-section warning */}
                    {result.outOfSectionWarning?.length > 0 && (
                        <div className="card" style={{
                            marginBottom: '1.5rem',
                            border: '1px solid var(--accent-amber)',
                            background: 'rgba(245, 158, 11, 0.08)',
                        }}>
                            <div className="card-header">
                                <h3 className="card-title" style={{ color: 'var(--accent-amber)' }}>
                                    ⚠️ Students from Other Sections Detected
                                </h3>
                                <span className="badge badge-warning">{result.outOfSectionWarning.length}</span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                                These students were recognized but belong to sections you did not select.
                                They are <strong>not included</strong> in this attendance record.
                            </p>
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Roll Number</th>
                                            <th>Actual Section</th>
                                            <th>Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.outOfSectionWarning.map((s, i) => (
                                            <tr key={i}>
                                                <td>{s.name}</td>
                                                <td>{s.rollNumber}</td>
                                                <td><span className="badge">{s.section}</span></td>
                                                <td>{(s.confidence * 100).toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            className="btn btn-success btn-lg"
                            onClick={async () => {
                                try {
                                    await attendanceAPI.approve(result._id, { status: 'approved' });
                                    navigate('/');
                                } catch (e) {
                                    setError('Approval failed');
                                }
                            }}
                        >
                            <FiCheck /> Approve Attendance
                        </button>
                        <button className="btn btn-outline btn-lg" onClick={() => { setResult(null); setCapturedImages([]); }}>
                            Retake Photos
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
