export interface PublicUser {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  createdAt: string;
}
