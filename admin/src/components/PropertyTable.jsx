function PropertyTable({ properties, onDeleteRequest }) {
  if (properties.length === 0) {
    return <p className="empty">No properties found. Add one using the button above.</p>;
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.code}>
              <td><code>{p.code}</code></td>
              <td>{p.title}</td>
              <td>{p.location}</td>
              <td>{p.rent}</td>
              <td>{p.bedrooms}bd / {p.bathrooms}ba</td>
              <td>{p.availability}</td>
              <td>
                <button
                  className="btn-delete"
                  onClick={() => onDeleteRequest(p.code)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PropertyTable;
