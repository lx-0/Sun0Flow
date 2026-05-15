export const openApiComponents = {
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
  } as const;
