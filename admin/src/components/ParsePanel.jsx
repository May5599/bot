import { useState } from 'react';

const EMPTY = {
  code: '', title: '', location: '', rent: '', availability: '',
  bedrooms: '', bathrooms: '', parking: '', restrictions: '', link: ''
};

function ParsePanel({ onSave, onClose }) {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [fields, setFields] = useState(EMPTY);
  const [error, setError] = useState('');

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setError('');
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText })
      });
      if (!res.ok) throw new Error('Parse failed');
      const data = await res.json();
      setParsed(data);
      setFields({ ...EMPTY, ...data });
    } catch {
      setError('Failed to parse. Check the server or try again.');
    } finally {
      setParsing(false);
    }
  }

  function handleFieldChange(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const NUMERIC_FIELDS = ['bedrooms', 'bathrooms'];

  return (
    <div className="modal-overlay">
      <div className="modal parse-panel">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Add Property via AI Parse</h2>

        {!parsed ? (
          <>
            <p>Paste a listing (email, ad, agent notes) and let AI extract the fields.</p>
            <textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="E.g. 3-bedroom house in South Keys, $2,550/month + utilities, available Dec 1st, garage, no pets..."
            />
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={handleParse} disabled={parsing || !rawText.trim()} className="btn-primary">
                {parsing ? 'Parsing...' : 'Parse with AI'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Review and edit the extracted fields before saving:</p>
            <div className="field-grid">
              {Object.keys(EMPTY).map((key) => (
                <label key={key} className="field-row">
                  <span className="field-label">{key}</span>
                  <input
                    type={NUMERIC_FIELDS.includes(key) ? 'number' : 'text'}
                    step={key === 'bathrooms' ? '0.5' : '1'}
                    value={fields[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="actions">
              <button onClick={() => setParsed(null)} className="btn-secondary">Back</button>
              <button onClick={() => onSave(fields)} className="btn-primary">Save Property</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ParsePanel;
