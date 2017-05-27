const CHORD_REGEXP = /\b[CDEFGAB](?:#{1,2}|b{1,2})?(?:maj7?|min7?|sus2?)\b/g;
const WHITESPACE_CHARS = [' ', '\t', '\n', '\r', '\u00A0', '\u2000', '\u2001', '\u2002', '\u2003', '\u2028', '\u2029'];

function nodeIsNotInsideAnchorTag(node) {
  return !MediumEditor.util.getClosestTag(node, 'a');
}

const log = msg => console.log(msg);

export default MediumEditor.Extension.extend({
  init: function () {
    log('init');

    MediumEditor.Extension.prototype.init.apply(this, arguments);
    this.disableEventHandling = false;
    this.subscribe('editableKeypress', this.onKeypress.bind(this));
    this.subscribe('editableBlur', this.onBlur.bind(this));
  },

  destroy: function () {

  },

  onBlur: function (blurEvent, editable) {
    this.performLinking(editable);
  },

  onKeypress: function (keyPressEvent) {
    if (this.disableEventHandling) {
      return;
    }

    if (MediumEditor.util.isKey(keyPressEvent, [MediumEditor.util.keyCode.SPACE, MediumEditor.util.keyCode.ENTER])) {
      clearTimeout(this.performLinkingTimeout);
      // Saving/restoring the selection in the middle of a keypress doesn't work well...
      this.performLinkingTimeout = setTimeout(function () {
        try {
          var sel = this.base.exportSelection();
          if (this.performLinking(keyPressEvent.target)) {
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
    }
  },

  performLinking: function (contenteditable) {
    /*
    Perform linking on blockElement basis, blockElements are HTML elements with text content and without
    child element.

    Example:
    - HTML content
    <blockquote>
      <p>link.</p>
      <p>my</p>
    </blockquote>

    - blockElements
    [<p>link.</p>, <p>my</p>]

    otherwise the detection can wrongly find the end of one paragraph and the beginning of another paragraph
    to constitute a link, such as a paragraph ending "link." and the next paragraph beginning with "my" is
    interpreted into "link.my" and the code tries to create a link across blockElements - which doesn't work
    and is terrible.
    (Medium deletes the spaces/returns between P tags so the textContent ends up without paragraph spacing)
    */
    var blockElements = MediumEditor.util.splitByBlockElements(contenteditable),
      documentModified = false;
    if (blockElements.length === 0) {
      blockElements = [contenteditable];
    }
    for (var i = 0; i < blockElements.length; i++) {
      documentModified = this.removeObsoleteAutoLinkSpans(blockElements[i]) || documentModified;
      documentModified = this.performLinkingWithinElement(blockElements[i]) || documentModified;
    }
    this.base.events.updateInput(contenteditable, { target: contenteditable, currentTarget: contenteditable });
    return documentModified;
  },

  removeObsoleteAutoLinkSpans: function (element) {
    if (!element || element.nodeType === 3) {
      return false;
    }

    var spans = element.querySelectorAll('span[data-auto-link="true"]'),
      documentModified = false;

    for (var i = 0; i < spans.length; i++) {
      var textContent = spans[i].textContent;
      if (textContent.indexOf('://') === -1) {
        textContent = MediumEditor.util.ensureUrlHasProtocol(textContent);
      }
      if (spans[i].getAttribute('data-href') !== textContent && nodeIsNotInsideAnchorTag(spans[i])) {
        documentModified = true;
        var trimmedTextContent = textContent.replace(/\s+$/, '');
        if (spans[i].getAttribute('data-href') === trimmedTextContent) {
          var charactersTrimmed = textContent.length - trimmedTextContent.length,
            subtree = MediumEditor.util.splitOffDOMTree(spans[i], this.splitTextBeforeEnd(spans[i], charactersTrimmed));
          spans[i].parentNode.insertBefore(subtree, spans[i].nextSibling);
        } else {
          // Some editing has happened to the span, so just remove it entirely. The user can put it back
          // around just the href content if they need to prevent it from linking
          MediumEditor.util.unwrap(spans[i], this.document);
        }
      }
    }
    return documentModified;
  },

  splitTextBeforeEnd: function (element, characterCount) {
    var treeWalker = this.document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false),
      lastChildNotExhausted = true;

    // Start the tree walker at the last descendant of the span
    while (lastChildNotExhausted) {
      lastChildNotExhausted = treeWalker.lastChild() !== null;
    }

    var currentNode,
      currentNodeValue,
      previousNode;
    while (characterCount > 0 && previousNode !== null) {
      currentNode = treeWalker.currentNode;
      currentNodeValue = currentNode.nodeValue;
      if (currentNodeValue.length > characterCount) {
        previousNode = currentNode.splitText(currentNodeValue.length - characterCount);
        characterCount = 0;
      } else {
        previousNode = treeWalker.previousNode();
        characterCount -= currentNodeValue.length;
      }
    }
    return previousNode;
  },

  performLinkingWithinElement: function (element) {
    const matches = this.findLinkableText(element);
    const linkCreated = false;

    for (var matchIndex = 0; matchIndex < matches.length; matchIndex++) {
      var matchingTextNodes = MediumEditor.util.findOrCreateMatchingTextNodes(this.document, element,
        matches[matchIndex]);
      if (this.shouldNotLink(matchingTextNodes)) {
        continue;
      }
      this.createAutoLink(matchingTextNodes, matches[matchIndex]);
    }
    return linkCreated;
  },

  shouldNotLink: function (textNodes) {
    var shouldNotLink = false;
    for (var i = 0; i < textNodes.length && shouldNotLink === false; i++) {
      // Do not link if the text node is either inside an anchor or inside span[data-auto-link]
      shouldNotLink = !!MediumEditor.util.traverseUp(textNodes[i], function (node) {
        return node.nodeName.toLowerCase() === 'a' ||
          (node.getAttribute && node.getAttribute('data-auto-link') === 'true');
      });
    }
    return shouldNotLink;
  },

  findLinkableText: function (contenteditable) {
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
          start: match.index,
          end: matchEnd,
          // TODO
          root: '',
          suffix: ''
        });
      }
    }
    return matches;
  },

  createAutoLink: function (textNodes, element) {
    console.log(textNodes, element);

    textNodes.forEach(node => {
      const span = this.document.createElement('span');
      span.setAttribute('data-auto-chord', 'true');
      span.setAttribute('data-chord', element);
      span.appendChild(node.cloneNode());
      node.replaceWith(span);
    });

    // href = MediumEditor.util.ensureUrlHasProtocol(href);
    // var anchor = MediumEditor.util.createLink(this.document, textNodes, href, this.getEditorOption('targetBlank') ? '_blank' : null);
    // anchor.insertBefore(span, anchor.firstChild);
    // while (anchor.childNodes.length > 1) {
    //   span.appendChild(anchor.childNodes[1]);
    // }
  }

});
