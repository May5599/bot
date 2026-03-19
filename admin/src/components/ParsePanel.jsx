import { useState } from 'react';

const EMPTY = {
  code: '', title: '', location: '', rent: '', availability: '',
  bedrooms: '', bathrooms: '', parking: '', restrictions: '', link: '', description: ''
};

const FIELD_LABELS = {
  code: 'Code',
  title: 'Title',
  location: 'Location',
  rent: 'Rent',
  availability: 'Availability',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  parking: 'Parking',
  restrictions: 'Restrictions',
  link: 'Listing URL',
  description: 'Description'
};

const NUMERIC_FIELDS = ['bedrooms', 'bathrooms'];
const TEXTAREA_FIELDS = ['description'];

// ParsePanel handles both "Add via AI parse" and "Edit existing property"
function ParsePanel({ onSave, onClose, initialData }) {
  const isEditMode = !!initialData;

  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState(isEditMode ? true : null); // skip step 1 in edit mode
  const [parsing, setParsing] = useState(false);
  const [fields, setFields] = useState(isEditMode ? { ...EMPTY, ...initialData } : EMPTY);
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

  return (
    <div className="modal-overlay">
      <div className="modal parse-panel">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>{isEditMode ? `Edit — ${initialData.code}` : 'Add Property via AI Parse'}</h2>

        {!parsed ? (
          <>
            <p>Paste a listing (email, ad, agent notes) and let AI extract the fields.</p>
            <textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="E.g. 3-bedroom condo in the Entertainment District, $2,450/month + utilities, available March 1st, optional parking $200/month, no smoking, pets allowed..."
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
            <p>{isEditMode ? 'Edit the fields and save your changes.' : 'Review and edit the extracted fields before saving.'}</p>
            <div className="field-grid">
              {Object.keys(EMPTY).map((key) => (
                <label key={key} className={`field-row ${TEXTAREA_FIELDS.includes(key) ? 'field-row-full' : ''}`}>
                  <span className="field-label">{FIELD_LABELS[key]}</span>
                  {TEXTAREA_FIELDS.includes(key) ? (
                    <textarea
                      rows={4}
                      value={fields[key]}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      placeholder="Full listing description — building amenities, location highlights, etc."
                    />
                  ) : (
                    <input
                      type={NUMERIC_FIELDS.includes(key) ? 'number' : 'text'}
                      step={key === 'bathrooms' ? '0.5' : '1'}
                      value={fields[key]}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="actions">
              {!isEditMode && (
                <button onClick={() => setParsed(null)} className="btn-secondary">Back</button>
              )}
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={() => onSave(fields)} className="btn-primary">
                {isEditMode ? 'Save Changes' : 'Save Property'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ParsePanel;
