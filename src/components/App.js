import React from 'react';

import Editor from '~/components/Editor/Editor';

class App extends React.Component {
  render() {
    return (
      <div className="App">
        <div className="App-header">
          <h2>Welcome to song writer</h2>
        </div>
        <div>
          <Editor />
        </div>
      </div>
    );
  }
}

export default App;
