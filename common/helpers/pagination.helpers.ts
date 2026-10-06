
const DEFAULT_LIMIT = 15

export const paginationMetadata = (skip: number, limit: number) => {
  const page = (skip / limit) + 1
  return { page, skip, limit }
}

export const getPaginationParams = (page?: number, limit?: number) => {
  const l = limit ? limit : DEFAULT_LIMIT
  const skip = page ? (page - 1) * l : 0

  return { skip, l }
}
