'use strict';
const CHORD_REGEXP = /\b([A-G](?:##?|bb?)?)((?:sus|maj|min|aug|dim|M|m|Δ|add|mM)?(?:[\d|b|#])*)\b/g;
const WHITESPACE_CHARS = [' ', '\t', '\n', '\r', '\u00A0', '\u2000', '\u2001', '\u2002', '\u2003', '\u2028', '\u2029'];

function nodeIsNotInsideAnchorTag(node) {
  return !MediumEditor.util.getClosestTag(node, 'a');
}

const log = msg => console.log(msg);

export default MediumEditor.Extension.extend({
  init: function () {
    this.chordNodes = [];

    MediumEditor.Extension.prototype.init.apply(this, arguments);
    // this.disableEventHandling = false;
    this.subscribe('editableKeypress', this.onKeypress.bind(this));
    // this.subscribe('editableBlur', this.onBlur.bind(this));
  },

  // destroy: function () {

  // },

  // onBlur: function (blurEvent, editable) {
  //   if (this.disableEventHandling) {
  //     return;
  //   }

  //   this.chordDetection(editable);
  // },

  onKeypress: function (keyPressEvent) {
    if (this.disableEventHandling) {
      return;
    }

    const options = {
      contenteditable: keyPressEvent.target
    };

    if (MediumEditor.util.isKey(keyPressEvent, [MediumEditor.util.keyCode.SPACE, MediumEditor.util.keyCode.ENTER])) {
      this.doDelayedChordDetection(options);
    }
  },

  doDelayedChordDetection(options) {
    clearTimeout(this.chordDetectionTimeout);
      // Saving/restoring the selection in the middle of a keypress doesn't work well...
    this.chordDetectionTimeout = setTimeout(function () {
      try {
        var sel = this.base.exportSelection();
        const chordDetectionSuccessful = this.chordDetection(options);
        if (chordDetectionSuccessful) {
          // pass true for favorLaterSelectionAnchor - this is needed for links at the end of a
          // paragraph in MS IE, or MS IE causes the link to be deleted right after adding it.
          this.base.importSelection(sel, true);
        }
      } catch (e) {
        if (window.console) {
          window.console.error('Failed to perform linking', e);
        }
        this.disableEventHandling = true;
      }
    }.bind(this), 0);
  },

  chordDetection: function (options) {
    let documentModified = false;
    let blockElements = MediumEditor.util.splitByBlockElements(options.contenteditable);
    if (blockElements.length === 0) {
      blockElements = [contenteditable];
    }

    documentModified = blockElements.some(blockElement => this.chordDetectionWithinElement(blockElement));

    // for (var i = 0; i < blockElements.length; i++) {
    //   documentModified = this.removeObsoleteAutoLinkSpans(blockElements[i]) || documentModified;
    //   documentModified = this.chordDetectionWithinElement(blockElements[i]) || documentModified;
    // }

    // this.base.events.updateInput(contenteditable, { target: contenteditable, currentTarget: contenteditable });
    return documentModified;
  },

  // removeObsoleteAutoLinkSpans: function (element) {
  //   if (!element || element.nodeType === 3) {
  //     return false;
  //   }

  //   var spans = element.querySelectorAll('span[data-auto-link="true"]'),
  //     documentModified = false;

  //   for (var i = 0; i < spans.length; i++) {
  //     var textContent = spans[i].textContent;
  //     if (textContent.indexOf('://') === -1) {
  //       textContent = MediumEditor.util.ensureUrlHasProtocol(textContent);
  //     }
  //     if (spans[i].getAttribute('data-href') !== textContent && nodeIsNotInsideAnchorTag(spans[i])) {
  //       documentModified = true;
  //       var trimmedTextContent = textContent.replace(/\s+$/, '');
  //       if (spans[i].getAttribute('data-href') === trimmedTextContent) {
  //         var charactersTrimmed = textContent.length - trimmedTextContent.length,
  //           subtree = MediumEditor.util.splitOffDOMTree(spans[i], this.splitTextBeforeEnd(spans[i], charactersTrimmed));
  //         spans[i].parentNode.insertBefore(subtree, spans[i].nextSibling);
  //       } else {
  //         // Some editing has happened to the span, so just remove it entirely. The user can put it back
  //         // around just the href content if they need to prevent it from linking
  //         MediumEditor.util.unwrap(spans[i], this.document);
  //       }
  //     }
  //   }
  //   return documentModified;
  // },

  // splitTextBeforeEnd: function (element, characterCount) {
  //   var treeWalker = this.document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false),
  //     lastChildNotExhausted = true;

  //   // Start the tree walker at the last descendant of the span
  //   while (lastChildNotExhausted) {
  //     lastChildNotExhausted = treeWalker.lastChild() !== null;
  //   }

  //   var currentNode,
  //     currentNodeValue,
  //     previousNode;
  //   while (characterCount > 0 && previousNode !== null) {
  //     currentNode = treeWalker.currentNode;
  //     currentNodeValue = currentNode.nodeValue;
  //     if (currentNodeValue.length > characterCount) {
  //       previousNode = currentNode.splitText(currentNodeValue.length - characterCount);
  //       characterCount = 0;
  //     } else {
  //       previousNode = treeWalker.previousNode();
  //       characterCount -= currentNodeValue.length;
  //     }
  //   }
  //   return previousNode;
  // },

  chordDetectionWithinElement: function (element) {
    const matchingChords = this.findChords(element);
    const linkCreated = matchingChords.some(matchedChord => {
      var matchingTextNodes = MediumEditor.util.findOrCreateMatchingTextNodes(this.document, element, matchedChord);
      if (this.shouldMarkChord(matchingTextNodes)) {
        this.markAsChord(matchingTextNodes, matchedChord);
      }
    });

    return linkCreated;
  },

  shouldMarkChord: function (textNodes) {
    // nodes get here after passing CHORD REGEX
    return textNodes.every(textNode => {
      let shouldMarkChord = true;

      MediumEditor.util.traverseUp(textNode, node => {
        const isA = node.nodeName.toLowerCase() === 'a';
        const wasMarkedChord = (node.getAttribute && node.getAttribute('data-auto-chord') === 'true');
        shouldMarkChord = shouldMarkChord && !isA && !wasMarkedChord;
      });

      return shouldMarkChord;
    });
  },

  findChords: function (contenteditable) {
    var textContent = contenteditable.textContent,
      match = null,
      matches = [];

    while ((match = CHORD_REGEXP.exec(textContent)) !== null) {
      let matchOk = true;
      let matchEnd = match.index + match[0].length;

      // If the regexp detected something as a link that has text immediately preceding/following it, bail out.
      matchOk = (match.index === 0 || WHITESPACE_CHARS.indexOf(textContent[match.index - 1]) !== -1) &&
        (matchEnd === textContent.length || WHITESPACE_CHARS.indexOf(textContent[matchEnd]) !== -1);

      if (matchOk) {
        matches.push({
          chord: match[0],
          root: match[1],
          suffix: match[2],
          start: match.index,
          end: matchEnd
        });
      }
    }
    return matches;
  },

  markAsChord: function (matchingTextNodes, matchedChord) {
    // console.log('markAsChord', matchingTextNodes, matchedChord);

    matchingTextNodes.forEach(node => {
      const span = this.document.createElement('span');
      span.setAttribute('data-auto-chord', 'true');
      span.setAttribute('data-chord-root', matchedChord.root);
      span.setAttribute('data-chord-suffix', matchedChord.suffix);
      span.setAttribute('style', 'color: blue;');
      span.appendChild(node.cloneNode());
      this.chordNodes.push(span);
      node.replaceWith(span);
    });

    // href = MediumEditor.util.ensureUrlHasProtocol(href);
    // var anchor = MediumEditor.util.createLink(this.document, textNodes, href, this.getEditorOption('targetBlank') ? '_blank' : null);
    // anchor.insertBefore(span, anchor.firstChild);
    // while (anchor.childNodes.length > 1) {
    //   span.appendChild(anchor.childNodes[1]);
    // }
  },

  transpose: function(delta) {
    const flatRoots = [ 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B' ];
    const sharpRoots = [ 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B' ];

    this.chordNodes.forEach(chordNode => {
      const root = chordNode.dataset.chordRoot;
      const flatIndex = flatRoots.indexOf(root);
      const sharpIndex = sharpRoots.indexOf(root);
      let newRoot = root;
      let newIndex;



      // TODO this is terrible there is a better way to do this
      if (flatIndex >= 0) {
        newIndex = flatIndex + delta;
        newRoot = flatRoots.slice(newIndex)[0];
      } else if (sharpIndex >= 0) {
        newIndex = sharpIndex + delta;
        newRoot = sharpRoots.slice(newIndex)[0];
      }

      if (newRoot !== root) {
        chordNode.setAttribute('data-chord-root', newRoot);
        chordNode.innerHTML = newRoot + chordNode.dataset.chordSuffix;
      }
    });
  }



});
