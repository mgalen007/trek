
export const paginationMetadata = (skip: number, limit: number) => {
  const page = (skip / 15) + 1
  return { page, skip, limit }
}

export const getPaginationParams = (page?: number, limit?: number) => {
  const skip = page ? (page - 1) * 15 : 0
  const l = limit ? limit : 15

  return { skip, l }
}
