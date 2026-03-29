## Modified Requirements

### Pin directory dialog uses PathPicker

- Pin directory dialog (`PinDirectoryDialog.tsx`) SHALL replace the plain text input with the `PathPicker` component
- The dialog SHALL serve as a thin wrapper providing the title, Cancel/Pin buttons, and calling `onPin` with the selected path
- All path navigation (typing, filtering, browsing) SHALL be handled by PathPicker internally
