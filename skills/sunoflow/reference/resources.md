# SunoFlow MCP resources

Read-only data accessible via the MCP `resources/read` request — no tool invocation required.

| URI | Kind | Returns |
| --- | --- | --- |
| `sunoflow://stats/credits` | static | Credit balance, monthly usage, full cost table |
| `sunoflow://feed/inspiration` | static | Top 20 pending RSS-feed inspiration items awaiting song-generation approval |
| `sunoflow://songs/{id}` | template | Single song: metadata, audio URL, lyrics, generation params |
| `sunoflow://playlists/{id}` | template | Playlist metadata + ordered track listing |

There is no list-resource for songs or playlists — use the `list_songs` tool for songs, and the playlist UI/API for browsing playlists.

## When to use a resource vs a tool

- **Resources** are cheap read-side fetches that don't deduct credits or trigger background work. Use them when you just need to display data.
- **Tools** are write-or-side-effect operations (`get_song` also doubles as a polling tool because it surfaces the latest `generationStatus`). Use them when you need fresh server-side state or want to mutate.
