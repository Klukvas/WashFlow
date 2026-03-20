export interface ApiResponse<T> {
  data: T;
  meta: {
    timestamp: string;
  };
}

export interface TimeSlot {
  start: string;
  end: string;
  workPostId: string;
  workPostName: string;
  available: boolean;
}
