// Ref callback for a Leaflet <Popup> whose content is rendered by React (cell popup, go-to pin popup).

// Two fixes for the React content of a cell popup (ref callback of <Popup>):
// - Leaflet re-measures a popup on every update (any re-render of the drawer): it clears the height for a
//   moment, which throws a scrolled popup back to the top. Keep the scroll position across that.
// - React handles a click inside the popup before Leaflet does. When the click swaps the button out (Edit →
//   form, Delete → Yes/No, Reset → spinner) the target is detached by the time the click bubbles to the map,
//   so Leaflet no longer sees it came from the popup and closes the popup as a map click. Clicks inside the
//   content therefore stop at the content node; the × button, map clicks and Esc still close the popup.
const stopAtContent = (e) => e.stopPropagation();
export const setupCellPopup = (popup) => {
  if (!popup || popup.__cellPopup) return;
  const layout = popup._updateLayout;
  popup._updateLayout = function updateLayoutKeepScroll() {
    const node = this._contentNode;
    const top = node ? node.scrollTop : 0;
    layout.call(this);
    if (node && top) node.scrollTop = top;
  };
  // the content node exists once the popup is first added to the map
  popup.on('add', () => {
    const node = popup._contentNode;
    if (node && !node.__stopsClicks) {
      node.addEventListener('click', stopAtContent);
      node.addEventListener('dblclick', stopAtContent);
      node.__stopsClicks = true;
    }
  });
  popup.__cellPopup = true;
};
