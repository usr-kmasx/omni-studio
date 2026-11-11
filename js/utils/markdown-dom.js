// Update rendered Markdown without replacing unchanged controls during streaming.
export function updateMarkdownDom(host, html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  function updateChildren(current, next) {
    const desired = [...next.childNodes];
    for (let index = 0; index < desired.length; index++) {
      const incoming = desired[index];
      const existing = current.childNodes[index];
      if (!existing) {
        current.append(incoming.cloneNode(true));
      } else if (existing.nodeType !== incoming.nodeType || existing.nodeName !== incoming.nodeName) {
        existing.replaceWith(incoming.cloneNode(true));
      } else if (existing.nodeType === Node.TEXT_NODE) {
        if (existing.data !== incoming.data) existing.data = incoming.data;
      } else if (existing.nodeType === Node.ELEMENT_NODE) {
        if (existing.matches('.md-copy') && incoming.matches('.md-copy')) continue;
        for (const attribute of [...existing.attributes]) {
          if (!incoming.hasAttribute(attribute.name)) existing.removeAttribute(attribute.name);
        }
        for (const attribute of incoming.attributes) {
          if (existing.getAttribute(attribute.name) !== attribute.value) {
            existing.setAttribute(attribute.name, attribute.value);
          }
        }
        updateChildren(existing, incoming);
      }
    }
    while (current.childNodes.length > desired.length) current.lastChild.remove();
  }

  updateChildren(host, template.content);
}
