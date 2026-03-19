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
  const [editTarget, setEditTarget] = useState(null);
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

  async function handleUpdate(property) {
    setSaveError('');
    try {
      const res = await fetch(`/api/properties/${property.code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(property)
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveError(err.error || 'Update failed');
        return;
      }
      setEditTarget(null);
      fetchProperties();
    } catch {
      setSaveError('Could not connect to server.');
    }
  }

  async function handleToggleStatus(property) {
    const updated = { ...property, status: property.status === 'active' ? 'inactive' : 'active' };
    await fetch(`/api/properties/${property.code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    fetchProperties();
  }

  const activeCount = properties.filter((p) => p.status === 'active').length;
  const inactiveCount = properties.length - activeCount;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="brand">
            <span className="brand-icon">🏠</span>
            <div>
              <h1>Rent In Ottawa</h1>
              <span className="subtitle">Messenger Bot — Property Manager</span>
            </div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => { setSaveError(''); setShowParsePanel(true); }}>
          + Add Property
        </button>
      </header>

      {!loading && properties.length > 0 && (
        <div className="stats-bar">
          <div className="stat-chip stat-total">
            <span className="stat-num">{properties.length}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-chip stat-active">
            <span className="stat-dot dot-green" />
            <span className="stat-num">{activeCount}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat-chip stat-inactive">
            <span className="stat-dot dot-red" />
            <span className="stat-num">{inactiveCount}</span>
            <span className="stat-label">Inactive</span>
          </div>
        </div>
      )}

      <main>
        {loading ? (
          <p className="loading">Loading properties...</p>
        ) : (
          <PropertyTable
            properties={properties}
            onDeleteRequest={(code) => setDeleteTarget(code)}
            onEditRequest={(p) => { setSaveError(''); setEditTarget(p); }}
            onToggleStatus={handleToggleStatus}
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

      {editTarget && (
        <ParsePanel
          initialData={editTarget}
          onSave={handleUpdate}
          onClose={() => setEditTarget(null)}
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
