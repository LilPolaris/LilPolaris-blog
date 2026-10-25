export function EditorSkeleton() {
  return (
    <div className="editor-page">
      <div aria-busy="true" aria-label="正在打开编辑器" className="editor-shell">
        <div className="editor-header">
          <div className="skeleton" style={{ height: 26, width: 64 }} />
          <div className="skeleton" style={{ height: 18, width: 180 }} />
          <div
            className="skeleton"
            style={{ height: 34, marginLeft: "auto", width: 72 }}
          />
        </div>
        <div className="editor-formatbar">
          <div className="skeleton" style={{ height: 30, width: 420 }} />
        </div>
        <div className="editor-workspace">
          <div className="editor-pane">
            <div className="editor-paper">
              <div className="skeleton" style={{ height: 36, marginBottom: 26, width: "55%" }} />
              <div className="editor-loading">
                <div className="skeleton" style={{ width: "92%" }} />
                <div className="skeleton" style={{ width: "78%" }} />
                <div className="skeleton" style={{ width: "86%" }} />
                <div className="skeleton" style={{ width: "40%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
