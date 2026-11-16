# Importing the workflows

These are sanitized n8n workflow exports. They intentionally omit credentials, account metadata, workflow IDs, active state, and local machine paths.

1. Import each JSON file into your n8n instance.
2. Reconnect credentials for Airtable, Gemini, OpenAI, Instagram, Firebase, and any other nodes used by your deployment.
3. Set `WE_HUMANITY_ROOT` to the absolute path of this repository in n8n's environment.
4. Replace `YOUR_AIRTABLE_BASE_ID`, `YOUR_AIRTABLE_TABLE_ID`, and `YOUR_AIRTABLE_RECORD_ID` with resources from your own Airtable workspace.
5. Review all external endpoints and activate workflows only after testing in your own environment.

The exports are supplied as a portfolio reference and require environment-specific configuration before use.
