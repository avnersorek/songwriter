import React from 'react';
// import ReactQuill from 'react-quill';
import ChordDetector from './MediumEditor.ChordDetector';

export default class Editor extends React.Component {
  constructor(props) {
    super(props)
    this.state = { text: '' }
  }

  handleChange(value) {
    this.setState({ text: value })
  }

  componentDidMount() {
    var editor = new MediumEditor('.editable', {
      extensions: {
        'chordDetector': new ChordDetector()
      }
    });

    editor.subscribe('editableInput', function (event, editable) {
      // todo: setState text

    });
  }

  render() {
    return (
      <div className="editable"></div>
    );
  }
}
