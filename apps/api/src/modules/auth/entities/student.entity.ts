export type StudentEntity = {
  id: string;
  email: string;
  timezone: string;
  password_hash: string;
};

export type CurrentStudentEntity = Pick<
  StudentEntity,
  'id' | 'email' | 'timezone'
>;
