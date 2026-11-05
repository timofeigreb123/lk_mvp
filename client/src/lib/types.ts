export type Role = 'STUDENT' | 'TEACHER';

export type User = {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  department: string | null;
  group: { id: number; name: string } | null;
};

export type Ref = { id: number; name: string };
export type Person = { id: number; fullName: string };
export type FileInfo = { id: number; originalName: string; size: number; mime: string };

export type Bell = { n: number; start: string; end: string };
export type LessonType = 'LECTURE' | 'PRACTICE' | 'LAB';

export type Lesson = {
  id: number;
  dayOfWeek: number;
  pairNumber: number;
  weekType: 'ALL' | 'UPPER' | 'LOWER';
  type: LessonType;
  room: string;
  subgroup: number | null;
  subject: Ref;
  teacher: Person;
  group: Ref;
};

export type Week = {
  weekStart: string;
  weekType: 'UPPER' | 'LOWER';
  bells: Bell[];
  days: { date: string; dayOfWeek: number; lessons: Lesson[] }[];
};

export type Meta = {
  groups: Ref[];
  teachers: User[];
  rooms: string[];
  teaching: { subject: Ref; group: Ref }[];
  bells: Bell[];
};

export type Status = 'PENDING' | 'OVERDUE' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED';

export type Submission = {
  id: number;
  attempt: number;
  comment: string;
  status: 'SUBMITTED' | 'RETURNED' | 'ACCEPTED';
  grade: string | null;
  teacherComment: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  files: FileInfo[];
};

export type AssignmentBase = {
  id: number;
  title: string;
  description: string;
  deadline: string;
  createdAt: string;
  subject: Ref;
  group: Ref;
  teacher: Person;
};

/** Элемент списка: у студента есть status/grade, у преподавателя — stats. */
export type AssignmentItem = AssignmentBase & {
  status?: Status;
  grade?: string | null;
  stats?: { total: number; submitted: number; toReview: number };
};

export type AssignmentDetail = AssignmentBase & {
  files: FileInfo[];
  status?: Status;
  mySubmissions?: Submission[];
  students?: { student: Person; status: Status; submissions: Submission[] }[];
};

export type Message = {
  id: number;
  chatId: number;
  text: string;
  createdAt: string;
  sender: Person;
  files: FileInfo[];
};

export type ChatItem = {
  id: number;
  type: 'DIRECT' | 'GROUP';
  title: string;
  peer: (Person & { role: Role }) | null;
  membersCount: number;
  lastMessage: Message | null;
  unread: number;
};
