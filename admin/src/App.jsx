import { useState, useEffect, useCallback } from 'react';
import PropertyTable from './components/PropertyTable';
import ParsePanel from './components/ParsePanel';
import ConfirmDialog from './components/ConfirmDialog';
import './App.css';

function App() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showParsePanel, setShowParsePanel] = useState(false);
  const [saveError, setSaveError] = useState('');

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/properties');
      const data = await res.json();
      setProperties(data);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  async function handleDelete(code) {
    await fetch(`/api/properties/${code}`, { method: 'DELETE' });
    setDeleteTarget(null);
    fetchProperties();
  }

  async function handleSave(property) {
    setSaveError('');
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(property)
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveError(err.error || 'Save failed');
        return;
      }
      setShowParsePanel(false);
      fetchProperties();
    } catch {
      setSaveError('Could not connect to server.');
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Rio Properties Admin</h1>
          <span className="subtitle">Manage rental listings for the Messenger bot</span>
        </div>
        <button className="btn-primary" onClick={() => { setSaveError(''); setShowParsePanel(true); }}>
          + Add Property
        </button>
      </header>

      <main>
        {loading ? (
          <p className="loading">Loading properties...</p>
        ) : (
          <PropertyTable
            properties={properties}
            onDeleteRequest={(code) => setDeleteTarget(code)}
          />
        )}
        {saveError && <p className="error">{saveError}</p>}
      </main>

      {showParsePanel && (
        <ParsePanel
          onSave={handleSave}
          onClose={() => setShowParsePanel(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete ${deleteTarget}? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default App;
