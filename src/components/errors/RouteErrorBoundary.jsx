import React from 'react';

class RouteErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  componentDidCatch(error, info) {
    console.error('RouteErrorBoundary caught an error', error, info);
  }

  render() {
    const { error } = this.state;
    const { FallbackComponent, children } = this.props;

    if (error) {
      return <FallbackComponent error={error} resetErrorBoundary={this.reset} />;
    }

    return children;
  }
}

export default RouteErrorBoundary;