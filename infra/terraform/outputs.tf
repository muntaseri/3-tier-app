output "frontend_public_ip" {
  description = "Public IPv4 address for the browser and HTTP entry point."
  value       = aws_instance.edge.public_ip
}

output "backend_private_ip" {
  description = "Private IPv4 address for the Node.js API host."
  value       = aws_instance.backend.private_ip
}

output "database_private_ip" {
  description = "Private IPv4 address for the PostgreSQL host."
  value       = aws_instance.database.private_ip
}

output "vpc_id" {
  description = "ShopLite VPC ID."
  value       = aws_vpc.shoplite.id
}
