export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "SunoFlow API",
    version: "0.1.0",
    description:
      "SunoFlow — AI music generation manager. Manage songs, playlists, tags, templates, and more.",
  },
  servers: [{ url: "/", description: "Current server" }],
  components: {
    securitySchemes: {
      session: {
        type: "apiKey" as const,
        in: "cookie" as const,
        name: "next-auth.session-token",
        description: "NextAuth session cookie (JWT)",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
      Song: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          prompt: { type: "string" },
          audioUrl: { type: "string", nullable: true },
          imageUrl: { type: "string", nullable: true },
          generationStatus: {
            type: "string",
            enum: ["pending", "ready", "failed"],
          },
          rating: { type: "integer", nullable: true, minimum: 1, maximum: 5 },
          ratingNote: { type: "string", nullable: true },
          isFavorite: { type: "boolean" },
          isPublic: { type: "boolean" },
          publicSlug: { type: "string", nullable: true },
          sunoJobId: { type: "string", nullable: true },
          pollCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          songTags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tag: { $ref: "#/components/schemas/Tag" },
              },
            },
          },
        },
      },
      Tag: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          color: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      TagWithCount: {
        allOf: [
          { $ref: "#/components/schemas/Tag" },
          {
            type: "object",
            properties: {
              _count: {
                type: "object",
                properties: { songTags: { type: "integer" } },
              },
            },
          },
        ],
      },
      Playlist: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PlaylistWithSongs: {
        allOf: [
          { $ref: "#/components/schemas/Playlist" },
          {
            type: "object",
            properties: {
              songs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    position: { type: "integer" },
                    song: { $ref: "#/components/schemas/Song" },
                  },
                },
              },
            },
          },
        ],
      },
      PromptTemplate: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          prompt: { type: "string" },
          style: { type: "string", nullable: true },
          isInstrumental: { type: "boolean" },
          isBuiltIn: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      RateLimitStatus: {
        type: "object",
        properties: {
          remaining: { type: "integer" },
          limit: { type: "integer" },
          used: { type: "integer" },
          percentUsed: { type: "number" },
          resetAt: { type: "string", format: "date-time" },
          dailyCounts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                count: { type: "integer" },
              },
            },
          },
        },
      },
      DashboardStats: {
        type: "object",
        properties: {
          totalSongs: { type: "integer" },
          totalFavorites: { type: "integer" },
          totalPlaylists: { type: "integer" },
          songsThisWeek: { type: "integer" },
          songsThisMonth: { type: "integer" },
          averageRating: { type: "number", nullable: true },
          ratedSongsCount: { type: "integer" },
          topTags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                count: { type: "integer" },
              },
            },
          },
          recentSongs: {
            type: "array",
            items: { $ref: "#/components/schemas/Song" },
          },
        },
      },
      ProfileStats: {
        type: "object",
        properties: {
          totalSongs: { type: "integer" },
          totalFavorites: { type: "integer" },
          totalPlaylists: { type: "integer" },
          totalTemplates: { type: "integer" },
          memberSince: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Not authenticated",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Unauthorized" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Not found" },
          },
        },
      },
      InternalError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Internal server error" },
          },
        },
      },
    },
  },
  security: [{ session: [] }],
  paths: {
    // ── Auth ──────────────────────────────────────────────
    "/api/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    email: { type: "string" },
                    name: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/InternalError" },
          "409": {
            description: "Email already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { error: "Email already registered" },
              },
            },
          },
        },
      },
    },
    "/api/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword", "confirmPassword"],
                properties: {
                  currentPassword: { type: "string" },
                  newPassword: { type: "string", minLength: 8 },
                  confirmPassword: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Password changed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/InternalError" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── Profile ──────────────────────────────────────────
    "/api/profile": {
      get: {
        tags: ["Profile"],
        summary: "Get current user profile",
        responses: {
          "200": {
            description: "User profile",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    email: { type: "string" },
                    name: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      patch: {
        tags: ["Profile"],
        summary: "Update profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated profile",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    email: { type: "string" },
                    name: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      delete: {
        tags: ["Profile"],
        summary: "Delete account and all data",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password", "confirmEmail"],
                properties: {
                  password: { type: "string" },
                  confirmEmail: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Account deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/profile/api-key": {
      get: {
        tags: ["Profile"],
        summary: "Get Suno API key status",
        responses: {
          "200": {
            description: "API key info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    hasKey: { type: "boolean" },
                    maskedKey: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      patch: {
        tags: ["Profile"],
        summary: "Update Suno API key",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sunoApiKey"],
                properties: {
                  sunoApiKey: {
                    type: "string",
                    description: "Empty string to remove key",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated key info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    hasKey: { type: "boolean" },
                    maskedKey: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/profile/password": {
      post: {
        tags: ["Profile"],
        summary: "Change password (alias)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword", "confirmPassword"],
                properties: {
                  currentPassword: { type: "string" },
                  newPassword: { type: "string", minLength: 8 },
                  confirmPassword: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Password changed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/profile/stats": {
      get: {
        tags: ["Profile"],
        summary: "Get user statistics",
        responses: {
          "200": {
            description: "User stats",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileStats" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── Songs ────────────────────────────────────────────
    "/api/songs": {
      get: {
        tags: ["Songs"],
        summary: "List songs with filtering and sorting",
        parameters: [
          {
            name: "q",
            in: "query",
            schema: { type: "string" },
            description: "Search by title or prompt",
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["ready", "pending", "failed"],
            },
            description: "Filter by generation status",
          },
          {
            name: "minRating",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 5 },
            description: "Minimum rating filter",
          },
          {
            name: "sortBy",
            in: "query",
            schema: {
              type: "string",
              enum: ["newest", "oldest", "highest_rated", "title_az"],
              default: "newest",
            },
          },
          {
            name: "sortDir",
            in: "query",
            schema: { type: "string", enum: ["asc", "desc"] },
          },
          {
            name: "dateFrom",
            in: "query",
            schema: { type: "string", format: "date" },
            description: "Start date filter (ISO)",
          },
          {
            name: "dateTo",
            in: "query",
            schema: { type: "string", format: "date" },
            description: "End date filter (ISO)",
          },
          {
            name: "tagId",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Filter by tag ID",
          },
        ],
        responses: {
          "200": {
            description: "Song list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    songs: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Song" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/generate": {
      post: {
        tags: ["Songs"],
        summary: "Generate a new song via Suno API",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string" },
                  title: { type: "string" },
                  tags: { type: "string" },
                  makeInstrumental: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Song generation started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    songs: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Song" },
                    },
                    rateLimit: { $ref: "#/components/schemas/RateLimitStatus" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/InternalError" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "429": {
            description: "Rate limit exceeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { error: "Rate limit exceeded" },
              },
            },
          },
        },
      },
    },
    "/api/songs/{id}/status": {
      get: {
        tags: ["Songs"],
        summary: "Get song generation status (polls Suno if pending)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Song with current status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    song: { $ref: "#/components/schemas/Song" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/songs/{id}/favorite": {
      patch: {
        tags: ["Songs"],
        summary: "Toggle song favorite status",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Updated favorite status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { isFavorite: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/songs/{id}/rating": {
      patch: {
        tags: ["Songs"],
        summary: "Set song rating",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["stars"],
                properties: {
                  stars: {
                    type: "integer",
                    minimum: 0,
                    maximum: 5,
                    description: "0 clears the rating",
                  },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated rating",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    rating: { type: "integer", nullable: true },
                    ratingNote: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/songs/{id}/share": {
      patch: {
        tags: ["Songs"],
        summary: "Toggle public sharing",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Updated share status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isPublic: { type: "boolean" },
                    publicSlug: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/songs/batch": {
      post: {
        tags: ["Songs"],
        summary: "Batch operations on songs (max 50)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action", "songIds"],
                properties: {
                  action: {
                    type: "string",
                    enum: ["favorite", "unfavorite", "delete"],
                  },
                  songIds: {
                    type: "array",
                    items: { type: "string", format: "uuid" },
                    maxItems: 50,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Batch result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    affected: { type: "integer" },
                    songIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── Song Tags ────────────────────────────────────────
    "/api/songs/{id}/tags": {
      get: {
        tags: ["Song Tags"],
        summary: "List tags on a song",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Tag list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tags: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Tag" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Song Tags"],
        summary: "Add a tag to a song (max 10 per song, 30 per user)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Create or find tag by name",
                  },
                  tagId: {
                    type: "string",
                    format: "uuid",
                    description: "Existing tag ID",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Tag added",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tag: { $ref: "#/components/schemas/Tag" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": {
            description: "Tag already on song",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/songs/{id}/tags/{tagId}": {
      delete: {
        tags: ["Song Tags"],
        summary: "Remove a tag from a song",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "tagId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Tag removed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── Tags ─────────────────────────────────────────────
    "/api/tags": {
      get: {
        tags: ["Tags"],
        summary: "List all user tags with song counts",
        responses: {
          "200": {
            description: "Tags with counts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tags: {
                      type: "array",
                      items: { $ref: "#/components/schemas/TagWithCount" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Tags"],
        summary: "Create a tag (max 30 per user)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", maxLength: 50 },
                  color: {
                    type: "string",
                    default: "#7c3aed",
                    description: "Hex color",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Tag created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tag: { $ref: "#/components/schemas/Tag" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": {
            description: "Tag name already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/tags/{id}": {
      patch: {
        tags: ["Tags"],
        summary: "Update a tag",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", maxLength: 50 },
                  color: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated tag",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tag: { $ref: "#/components/schemas/Tag" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Tags"],
        summary: "Delete a tag",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Tag deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Playlists ────────────────────────────────────────
    "/api/playlists": {
      get: {
        tags: ["Playlists"],
        summary: "List playlists with song counts",
        responses: {
          "200": {
            description: "Playlist list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    playlists: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Playlist" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Playlists"],
        summary: "Create a playlist (max 50 per user)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", maxLength: 100 },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Playlist created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    playlist: { $ref: "#/components/schemas/Playlist" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/playlists/{id}": {
      get: {
        tags: ["Playlists"],
        summary: "Get playlist with songs",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Playlist with songs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    playlist: {
                      $ref: "#/components/schemas/PlaylistWithSongs",
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Playlists"],
        summary: "Update playlist",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", maxLength: 100 },
                  description: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated playlist",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    playlist: { $ref: "#/components/schemas/Playlist" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Playlists"],
        summary: "Delete a playlist",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Playlist deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/playlists/{id}/songs": {
      post: {
        tags: ["Playlists"],
        summary: "Add a song to a playlist (max 500 per playlist)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["songId"],
                properties: {
                  songId: { type: "string", format: "uuid" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Song added to playlist",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    playlistSong: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        position: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": {
            description: "Song already in playlist",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/playlists/{id}/songs/{songId}": {
      delete: {
        tags: ["Playlists"],
        summary: "Remove a song from a playlist",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "songId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Song removed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/playlists/{id}/reorder": {
      patch: {
        tags: ["Playlists"],
        summary: "Reorder songs in a playlist",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["songIds"],
                properties: {
                  songIds: {
                    type: "array",
                    items: { type: "string", format: "uuid" },
                    description:
                      "All song IDs in desired order (must include all songs)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Reordered",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Prompt Templates ─────────────────────────────────
    "/api/prompt-templates": {
      get: {
        tags: ["Prompt Templates"],
        summary: "List prompt templates (built-in + user)",
        responses: {
          "200": {
            description: "Template list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    templates: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/PromptTemplate",
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Prompt Templates"],
        summary: "Create a prompt template (max 20 per user)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "prompt"],
                properties: {
                  name: { type: "string" },
                  prompt: { type: "string" },
                  style: { type: "string" },
                  isInstrumental: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Template created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    template: {
                      $ref: "#/components/schemas/PromptTemplate",
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/prompt-templates/{id}": {
      delete: {
        tags: ["Prompt Templates"],
        summary: "Delete a user-created template",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Template deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": {
            description: "Cannot delete built-in templates",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },

    // ── Rate Limit ───────────────────────────────────────
    "/api/rate-limit": {
      get: {
        tags: ["Rate Limit"],
        summary: "Get rate limit info",
        responses: {
          "200": {
            description: "Rate limit data",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RateLimitStatus" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/rate-limit/status": {
      get: {
        tags: ["Rate Limit"],
        summary: "Get detailed rate limit status with 7-day history",
        responses: {
          "200": {
            description: "Detailed rate limit status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RateLimitStatus" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── Dashboard ────────────────────────────────────────
    "/api/dashboard/stats": {
      get: {
        tags: ["Dashboard"],
        summary: "Get dashboard statistics",
        responses: {
          "200": {
            description: "Dashboard stats",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardStats" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    // ── Export ────────────────────────────────────────────
    "/api/export": {
      get: {
        tags: ["Export"],
        summary: "Export user data as JSON or CSV",
        parameters: [
          {
            name: "format",
            in: "query",
            schema: {
              type: "string",
              enum: ["json", "csv"],
              default: "json",
            },
          },
          {
            name: "type",
            in: "query",
            schema: {
              type: "string",
              enum: ["songs", "playlists", "all"],
              default: "all",
            },
            description: "CSV only supports songs",
          },
        ],
        responses: {
          "200": {
            description: "File download",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
              "text/csv": {
                schema: { type: "string" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── Onboarding ───────────────────────────────────────
    "/api/onboarding/complete": {
      post: {
        tags: ["Onboarding"],
        summary: "Mark onboarding as complete",
        responses: {
          "200": {
            description: "Onboarding completed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/onboarding/reset": {
      post: {
        tags: ["Onboarding"],
        summary: "Reset onboarding status",
        responses: {
          "200": {
            description: "Onboarding reset",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── RSS ──────────────────────────────────────────────
    "/api/rss/fetch": {
      post: {
        tags: ["RSS"],
        summary: "Fetch RSS feeds (max 10 URLs)",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["urls"],
                properties: {
                  urls: {
                    type: "array",
                    items: { type: "string", format: "uri" },
                    maxItems: 10,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Fetched feeds",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    feeds: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
