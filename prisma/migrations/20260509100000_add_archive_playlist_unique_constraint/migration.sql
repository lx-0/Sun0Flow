-- CreateIndex
CREATE UNIQUE INDEX "Playlist_userId_smartPlaylistType_key" ON "Playlist"("userId", "smartPlaylistType");
