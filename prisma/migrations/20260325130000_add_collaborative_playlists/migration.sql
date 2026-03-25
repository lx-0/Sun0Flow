-- AddColumn: isCollaborative to Playlist
ALTER TABLE "Playlist" ADD COLUMN "isCollaborative" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn: addedByUserId to PlaylistSong
ALTER TABLE "PlaylistSong" ADD COLUMN "addedByUserId" TEXT;

-- AddForeignKey for PlaylistSong.addedByUserId
ALTER TABLE "PlaylistSong" ADD CONSTRAINT "PlaylistSong_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: PlaylistCollaborator
CREATE TABLE "PlaylistCollaborator" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "userId" TEXT,
    "inviteToken" TEXT NOT NULL,
    "inviteExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistCollaborator_inviteToken_key" ON "PlaylistCollaborator"("inviteToken");
CREATE INDEX "PlaylistCollaborator_playlistId_idx" ON "PlaylistCollaborator"("playlistId");
CREATE INDEX "PlaylistCollaborator_userId_idx" ON "PlaylistCollaborator"("userId");
CREATE INDEX "PlaylistCollaborator_inviteToken_idx" ON "PlaylistCollaborator"("inviteToken");

-- AddForeignKey
ALTER TABLE "PlaylistCollaborator" ADD CONSTRAINT "PlaylistCollaborator_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaylistCollaborator" ADD CONSTRAINT "PlaylistCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
