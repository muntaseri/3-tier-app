variable "aws_region" {
  description = "AWS region for the ShopLite deployment."
  type        = string
  default     = "ap-southeast-1"
}

variable "key_name" {
  description = "Existing EC2 key pair name used for SSH administration."
  type        = string
}

variable "ssh_cidr" {
  description = "Single trusted public IPv4 CIDR allowed to SSH to EC2-1."
  type        = string

  validation {
    condition     = can(cidrnetmask(var.ssh_cidr)) && can(regex("/32$", var.ssh_cidr))
    error_message = "ssh_cidr must be a single IPv4 address with a /32 mask."
  }
}

variable "frontend_image" {
  description = "Public frontend image, including a version tag."
  type        = string

  validation {
    condition     = can(regex(":v[0-9]+\\.[0-9]+\\.[0-9]+([-.][A-Za-z0-9.-]+)?$", var.frontend_image))
    error_message = "frontend_image must use a version tag such as v1.0.0, not latest."
  }
}

variable "backend_image" {
  description = "Public backend image, including a version tag."
  type        = string

  validation {
    condition     = can(regex(":v[0-9]+\\.[0-9]+\\.[0-9]+([-.][A-Za-z0-9.-]+)?$", var.backend_image))
    error_message = "backend_image must use a version tag such as v1.0.0, not latest."
  }
}

variable "db_password" {
  description = "PostgreSQL password; use at least 16 letters, digits, underscores, or hyphens."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{16,}$", var.db_password))
    error_message = "db_password must be at least 16 characters and contain only letters, digits, underscores, or hyphens."
  }
}

variable "instance_type" {
  description = "EC2 instance type for the three Ubuntu hosts."
  type        = string
  default     = "t3.micro"
}
