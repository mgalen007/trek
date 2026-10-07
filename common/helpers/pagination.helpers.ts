const DEFAULT_LIMIT = 15;

export const paginationMetadata = (
  skip: number,
  limit: number,
  total: number,
) => {
  const page = skip / limit + 1;
  const totalPages = Math.ceil(total / limit);
  return { page, skip, limit, total, totalPages };
};

export const getPaginationParams = (page?: number, limit?: number) => {
  const l = limit ? limit : DEFAULT_LIMIT;
  const skip = page ? (page - 1) * l : 0;

  return { skip, l };
};
