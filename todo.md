- [x] repositioning
- [x] add logging across the board using loguru
- [x] one more deck shape would be nice (hexagon or something else)
- [x] remove `demos/` folder
- [ ] cards need unique ids in the deck -- ensure and give warning if they are not
- [ ] dialog window should `.pack()/.grid()` properly -- shouldn't need to specify size
- [ ] hexagon and other shapes should be refactored into their own `ShapeWidget` class or something
  - hexagon shape code is bloated, not sustainable if we keep adding new shapes
- [ ] fix jank shapes/borders -- sometimes rectangle overflows outside the deck size
- [ ] add antialiasing on circle, angles on hexagon, etc. smooth lines please.
- [ ] add [taskwarrior json file format][1] for another storage backend
- [ ] add [x]it! file format for another storage backend
- [ ] multi panes
- [ ] grid/element snapping to an imaginary grid or along an archimedean spiral
- [ ] move the done items to the bottom, greyed out under the active items in deck
- [ ] add logging to a log file for changes to cards / decks
- [ ] color Picker + color History
- [ ] fix Deck Selection
- [ ] right Click Context to Decks
- [ ] resize indicator on lower right corner
- [ ] edit Deck button that brings back the edit pane for the deck

---

[1]: https://taskwarrior.org/docs/commands/export/
