## 11. Settings

### 11.1 Profile Section

**Layout:** Card with "Profile" title and "Manage your profile" subtitle.

**Avatar uploader:**
- 96x96 `Avatar` preview.
- "Upload" / "Change" outlined button (toggles based on whether an avatar exists).
- "Remove" outlined button (visible when an avatar is set).
- Hidden file input accepting `image/jpeg, image/png, image/gif, image/webp`.
- Max input size: 10MB. Images are compressed client-side: resized to max 1024px on longest side, JPEG at 0.85 quality, white fill for transparency.
- Uploads via `POST /api/avatars` to the backend with `Bearer` auth token.
- Hint text below avatar buttons.

**Display Name:**
- `TextField` with person icon adornment, max 100 chars, placeholder text.

**Instagram Profile URL:**
- `TextField` with Instagram icon adornment.
- Validated against `instagram.com/<username>` pattern.

**Email:**
- `TextField`, disabled/read-only, person icon adornment.
- Helper text explaining it cannot be changed.

**Save button:** Full-width contained button. Shows `CircularProgress` spinner while saving. Calls `PUT /api/internal/profile`.

---

### 11.2 Display Preferences

Card with "Display" title and subtitle.

**Grade Format Toggle:**
- `ToggleButtonGroup` with two options: "V-Grade" (V3, V6) and "Font" (6A, 7C+).
- Persisted via `useGradeFormat` hook (IndexedDB).

**Apple Health Integration** (iOS only, conditionally rendered):
- `FormControlLabel` with `Switch` toggle.
- Label and subtitle text.
- Only visible when `isHealthKitAvailable()` returns true.

---

### 11.3 Password Management

**Component:** `SetPasswordSection`

**When password is set:**
- Card with green checkmark icon + "Password Enabled" title.
- Description showing the email address.

**When password is not set:**
- Card with "Set Password" title and description.
- Info alert showing linked OAuth providers (Google, Apple, Facebook).
- Form with:
  - Password field (min 8, max 128 chars, `new-password` autocomplete, lock icon).
  - Confirm password field.
  - "Set Password" contained button with lock icon.
- Validation: required, min length, max length, passwords must match.

---

### 11.4 Aurora Account Linking

**Component:** `AuroraCredentialsSection`

Card for each board type (iterates `AURORA_BOARDS`: kilter, tension).

**Not Connected state:**
- Board name + "Board" suffix as title.
- Description text (Kilter has special "shutdown" text).
- Buttons:
  - "Link Account" contained button (non-Kilter only): Opens link dialog.
  - "Import JSON" outlined button: Opens file picker.
  - "Request Data" outlined button (Kilter only): Opens pre-filled mailto link to Aurora Climbing.

**Connected state:**
- Board name as title + status chip:
  - Active: green `CheckCircleOutlined` + "Connected"
  - Error: red `WarningAmberOutlined` + "Error"
  - Expired: yellow `AccessTimeOutlined` + "Expired"
  - Syncing: blue `SyncOutlined` + "Syncing"
- Info rows: Username, last synced timestamp.
- Error message (if any).
- Unsynced counts warning alert (ascents + climbs).
- Buttons: "Unlink" (red, with confirmation popover) + "Import JSON".

**Link Account Dialog:**
- Title: "Link <Board> Account"
- Username + password text fields.
- "Link Account" contained button.

**Import Flow** (unified dialog with phase transitions):
1. **Preview phase**: Shows parsed export data counts (draft climbs, ascents, attempts, circuits). Cancel/Confirm buttons.
2. **Importing phase**: Step-by-step progress with `ImportProgressSteps`:
   - Steps: Importing draft climbs -> Resolving climb names -> Checking for duplicates -> Importing ascents -> Importing attempts -> Importing circuits -> Building sessions.
   - Each step shows: complete checkmark, active spinner, or pending circle.
   - Active step shows progress bar with count (e.g., "142 / 500").
3. **Complete phase**: Results summary per category (imported/skipped/failed counts). Unresolved climbs warning (shows up to 20 names).
4. **Error phase**: Error alert with message.

---

### 11.5 ESP32 Controllers

**Component:** `ControllersSection`

**Controller List:**
- Cards for each registered controller showing:
  - Name (or "Unnamed Controller").
  - Status chip: Online (green), Offline (default), Never Connected (default).
  - Board type chip (primary color).
  - Layout/Size info row.
  - Last seen timestamp (formatted as relative time: "just now", "5m ago", "2h ago", or full date).
  - "Delete Controller" red outlined button with confirmation popover.

**Add Controller Dialog:**
- Name input (optional, max 100 chars).
- Cascading select dropdowns: Board Type -> Layout -> Size -> Hold Sets (multi-select, auto-selects all on size change).
- "Register Controller" contained button.

**API Key Success Dialog:**
- Warning alert: "Save this key now -- you won't be able to see it again."
- Controller name display.
- Monospace read-only text field with the API key.
- "Copy to Clipboard" outlined button.
- "Done" contained button.

---

### 11.6 Account Deletion

**Component:** `DeleteAccountSection`

**Main card:**
- "Delete Account" title.
- Warning text about permanent deletion.
- "Delete Account" red outlined button.

**Confirmation Dialog:**
- Title: "Delete Your Account".
- Warning text about irreversibility.
- Loading state while fetching `deleteAccountInfo` (published climb count).
- Published climbs notice: "You have X published climbs. These will be preserved but..."
- Checkbox: "Remove my setter name from published climbs" (visible when user has published climbs).
- Type "DELETE" confirmation text field.
- Cancel (text) + "Delete Account" (red contained, disabled until "DELETE" is typed) buttons.
- Calls `DELETE_ACCOUNT` mutation, then `signOut` and redirect to home.

**Data operations:**
- `profile` -- REST `GET /api/internal/profile`.
- `updateProfile` -- REST `PUT /api/internal/profile`.
- `auroraCredentials` -- REST `GET/POST/DELETE /api/internal/aurora-credentials`.
- `myControllers` -- REST `GET/POST/DELETE /api/internal/controllers`.
- `deleteAccountInfo` / `GET_DELETE_ACCOUNT_INFO` -- GraphQL query for published climb count.
- `deleteAccount` / `DELETE_ACCOUNT` -- GraphQL mutation.
- `saveAuroraCredential` -- REST POST.
- `deleteAuroraCredential` -- REST DELETE.
- `registerController` -- REST POST (returns API key).
- `deleteController` -- REST DELETE.

---

