function PropertyTable({ properties, onDeleteRequest, onEditRequest, onToggleStatus }) {
  if (properties.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🏘️</div>
        <p>No properties yet. Add one using the button above.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Location</th>
            <th>Rent</th>
            <th>Bed / Bath</th>
            <th>Available</th>
            <th>Status</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.code} className={p.status === 'inactive' ? 'row-inactive' : ''}>
              <td><code>{p.code}</code></td>
              <td className="td-title">{p.title}</td>
              <td className="td-muted">{p.location}</td>
              <td className="td-rent">{p.rent}</td>
              <td className="td-muted">{p.bedrooms}bd / {p.bathrooms}ba</td>
              <td className="td-muted">{p.availability}</td>
              <td>
                <button
                  className={`status-badge ${p.status === 'active' ? 'badge-active' : 'badge-inactive'}`}
                  onClick={() => onToggleStatus(p)}
                  title="Click to toggle status"
                >
                  <span className="badge-dot" />
                  {p.status === 'active' ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td>
                <div className="action-btns">
                  <button
                    className="btn-icon btn-edit"
                    onClick={() => onEditRequest(p)}
                    title="Edit property"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon btn-del"
                    onClick={() => onDeleteRequest(p.code)}
                    title="Delete property"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PropertyTable;
