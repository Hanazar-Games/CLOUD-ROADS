export function setText(node, value) {
  const text = String(value);
  if (node.textContent === text) return;
  const child = node.firstChild;
  if (child?.nodeType === 3 && !child.nextSibling) child.data = text;
  else node.textContent = text;
}

export function setHTML(node, value) {
  if (node.innerHTML !== value) node.innerHTML = value;
}

export function setAttribute(node, name, value) {
  const text = String(value);
  if (node.getAttribute(name) !== text) node.setAttribute(name, text);
}

export function setStyle(node, name, value) {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

export function setHidden(node, hidden) {
  if (node.hidden !== hidden) node.hidden = hidden;
}
