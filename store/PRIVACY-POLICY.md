# TabNest Privacy Policy

**Last updated:** 2026-03-03
**Extension:** TabNest — Smart Tab Groups
**Version:** 1.0.0

---

## Summary

TabNest does not collect, transmit, or share any personal data. All data processed by this extension stays on your device. There is no server, no account, no analytics, and no telemetry of any kind.

---

## 1. Data We Collect

**We collect no data.**

TabNest does not collect, record, or transmit any personal information, browsing history, tab URLs, form content, or any other data to any external server or third party.

All extension functionality operates entirely within your local browser instance.

---

## 2. Data Stored Locally

TabNest stores the following data **locally on your device only**, using the browser's built-in `storage.local` and `storage.sync` APIs:

**`storage.local` (device-local, not synced):**
- Tab session state: URLs, titles, and favicon URLs of your saved and archived tabs
- Navigation history: up to 20 visited URLs per closed tab
- Workspace snapshots: named session snapshots you explicitly save (maximum 20)

**`storage.sync` (synced across your devices via your browser account, if signed in):**
- Extension settings: lifecycle timer values, behavior toggles, whitelist domains
- Custom domain-to-group mapping rules
- Group metadata: group names, colors, and order

**Form field content is never read or stored.** The form-detection content script only checks whether any form field has been modified (a boolean dirty/clean state). It does not read, store, or transmit form field content.

---

## 3. Permissions Justification

TabNest requests the following browser permissions:

| Permission | Why It Is Needed |
|-----------|-----------------|
| `tabs` | Read tab URL, title, and favicon to display in sidebar; manage tab lifecycle |
| `storage` | Persist session state, settings, and workspace snapshots |
| `alarms` | Fire the 30-second lifecycle timer tick |
| `sidePanel` (Chromium) / `sidebar_action` (Firefox) | Open the TabNest sidebar panel |
| `webNavigation` | Detect POST-backed page loads for the stateful URL warning |
| `<all_urls>` host permission | Inject content scripts for form state detection and navigation history capture |

No permissions are requested beyond those listed above.

---

## 4. Third-Party Services

**None.** TabNest does not use, communicate with, or depend on any third-party service, analytics platform, crash reporter, advertising network, or external API. There is no network activity initiated by this extension.

---

## 5. Children's Privacy

TabNest does not knowingly collect any information from users of any age, as it collects no information at all.

---

## 6. Your Rights

Because TabNest stores no personal data externally, there is no data to access, correct, or delete from our systems. All locally stored data can be viewed, exported, and deleted at any time using the "Export Data" and "Clear All Data" options in the TabNest settings panel.

---

## 7. Changes to This Policy

If the extension's data handling changes in a future version, this policy will be updated before that version is published.

---

## 8. Contact

TabNest is an open-source project. If you have questions about this privacy policy, please open an issue in the project repository.

---

## 9. Open Source

The TabNest source code is available for inspection. You can verify the absence of data collection, telemetry, or third-party communication by reviewing the source directly.

---

*This privacy policy applies to the TabNest browser extension version 1.0.0 and later versions unless superseded by an updated policy.*
