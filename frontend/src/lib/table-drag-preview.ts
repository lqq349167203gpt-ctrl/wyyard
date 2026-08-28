interface TableDragPreviewOptions {
  leading: string
  title: string
  trailing: string
}

export function createTableDragPreview({
  leading,
  title,
  trailing,
}: TableDragPreviewOptions): HTMLDivElement {
  const preview = document.createElement("div")

  Object.assign(preview.style, {
    position: "fixed",
    top: "-1000px",
    left: "0",
    zIndex: "9999",
    display: "flex",
    alignItems: "center",
    width: "560px",
    height: "38px",
    padding: "0 12px",
    gap: "12px",
    overflow: "hidden",
    border: "1px solid #dee0e3",
    borderRadius: "4px",
    background: "#ffffff",
    boxShadow: "0 3px 10px rgba(31, 35, 41, 0.12)",
    color: "#2b2f36",
    fontFamily: "inherit",
    fontSize: "12px",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  })

  const leadingElement = document.createElement("span")
  leadingElement.textContent = leading
  Object.assign(leadingElement.style, {
    flex: "0 0 auto",
    color: "#646a73",
  })

  const titleElement = document.createElement("span")
  titleElement.textContent = title
  Object.assign(titleElement.style, {
    minWidth: "0",
    flex: "1 1 auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "#1f2329",
    fontWeight: "500",
  })

  const trailingElement = document.createElement("span")
  trailingElement.textContent = trailing
  Object.assign(trailingElement.style, {
    flex: "0 0 auto",
    color: "#8f959e",
    fontVariantNumeric: "tabular-nums",
  })

  preview.append(leadingElement, titleElement, trailingElement)
  document.body.appendChild(preview)
  return preview
}
