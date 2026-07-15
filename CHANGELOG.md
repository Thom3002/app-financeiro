# Changelog

All notable changes to this project will be documented in this file.

## [1.1.1] - 2026-07-15

### Added
- **Date Sorting for Transactions**:
  - Added the ability to sort transactions by date in ascending or descending order by clicking the "Data" table header, with a visual sorting direction indicator (arrow).
- **Category Autocomplete in Classification**:
  - Implemented category and subcategory autocomplete dropdown menus in the "Classificar" screen (both for keyword rules and frequency suggestion forms), enabling quick selection of existing database categories.
- **Category Color Presets**:
  - Replaced the free color picker in the category creation/editing modal with a preset palette of 11 premium colors (displayed as clickable swatches), allowing consistent and repeatable color coordination across categories.
- **Import History Deletion**:
  - Implemented the ability to delete imported statements from the history list, automatically reversing the import by deleting all transactions associated with that specific upload.

### Fixed
- **Category Visibility in Inline Editing**:
  - Fixed new categories (e.g. without any transactions linked to them yet) not showing up in the transactions list inline editor autocomplete by switching from transaction-based distinct categories to the actual database-backed categories list. Added subcategory autocomplete inside the inline editor.
- **Sidebar Navigation**:
  - Fixed the stale unclassified badge count in the sidebar by refactoring it to re-fetch the count dynamically upon route transitions (using `useLocation`) and instantly when children pages dispatch a custom `unclassified-count-changed` event (e.g. after CSV imports, manual edits, or classification rule applications).
- **Dashboard**:
  - Fixed the readability of category labels in the "Gastos por Categoria" pie chart by overriding Recharts label text styling to use the light primary text color in dark mode (making them visible on the dark background).
- **Bradesco Statement Parser**:
  - Added support for 4-digit years (`YYYY`) in checking account date parsing, in addition to 2-digit years (`YY`).
  - Improved bank type detection (`isChecking` / `isCreditCard`) by using accent-insensitive and case-insensitive normalization on CSV content. This prevents mismatches from encoding errors or encoding transformations in the browser/frontend.
- **Import Encoding Handling**:
  - Implemented dynamic encoding detection in the upload controller. The backend now decodes uploaded CSV buffers by trying `UTF-8` first (with strict validation and BOM stripping) and falling back to `Windows-1252` (ISO-8859-1) if invalid byte sequences are encountered. This natively prevents character corruption in files exported directly from Brazilian banks.
- **Tests**:
  - Added unit test cases for Bradesco checking account statements containing 4-digit years.
