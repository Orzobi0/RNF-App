import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:16,fontFamily:'system-ui'}}>
          <h2>Se produjo un error</h2>
          <pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
