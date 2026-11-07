function validateProduct(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Request body must be an object." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const price = Number(input.price);

  if (!name || name.length > 120) {
    return { error: "Name is required and must be 120 characters or fewer." };
  }
  if (description.length > 1000) {
    return { error: "Description must be 1000 characters or fewer." };
  }
  if (!Number.isFinite(price) || price <= 0 || price > 99999999.99) {
    return { error: "Price must be greater than zero and at most 99,999,999.99." };
  }

  return { value: { name, description, price } };
}

module.exports = { validateProduct };
