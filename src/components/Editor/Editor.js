import React from 'react';
// import ReactQuill from 'react-quill';
import ChordDetector from './MediumEditor.ChordDetector';

let lastSaved = new Date(0,0,0);
const saveKey = 'songContents';

function shouldSave() {
  const timePassed = new Date() - lastSaved
  return (timePassed > 1000 * 5);
}

function save(data) {
  console.log('saved');
  localStorage.setItem(saveKey, data);
  lastSaved = new Date();
}

function load() {
  return localStorage.getItem(saveKey);
}

export default class Editor extends React.Component {

  componentDidMount() {
    this.chordDetector = new ChordDetector();

    var editor = new MediumEditor('.editable', {
      extensions: {
        chordDetector: this.chordDetector
      }
    });

    editor.subscribe('editableInput', function (event, editable) {
      if (shouldSave()) {
        save(editor.serialize()['element-0'].value);
      }
    });

    const oldData = load();
    if (oldData) {
      editor.setContent(oldData, 0);
    }

    this.editorInput.focus();
  }

  render() {
    return (
      <div>
        <h2>Song title</h2>
        <button onClick={() => this.chordDetector.transpose(1)}>+</button>
        <button onClick={() => this.chordDetector.transpose(-1)}>-</button>
        <div className="editable" ref={input => this.editorInput = input}></div>
      </div>
    );
  }
}
