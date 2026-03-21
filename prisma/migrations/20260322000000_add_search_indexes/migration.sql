-- CreateIndex
CREATE INDEX "Playlist_userId_name_idx" ON "Playlist"("userId", "name");

-- CreateIndex
CREATE INDEX "Song_userId_title_idx" ON "Song"("userId", "title");

-- CreateIndex
CREATE INDEX "Song_userId_prompt_idx" ON "Song"("userId", "prompt");
