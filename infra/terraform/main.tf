data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

locals {
  vpc_cidr            = "10.20.0.0/16"
  public_subnet_cidr  = "10.20.1.0/24"
  private_subnet_cidr = "10.20.2.0/24"
  edge_private_ip     = "10.20.1.10"
  backend_private_ip  = "10.20.2.20"
  database_private_ip = "10.20.2.30"
  common_tags = {
    Project   = "ShopLite"
    ManagedBy = "Terraform"
  }
}

resource "aws_vpc" "shoplite" {
  cidr_block           = local.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, { Name = "shoplite-vpc" })
}

resource "aws_internet_gateway" "shoplite" {
  vpc_id = aws_vpc.shoplite.id
  tags   = merge(local.common_tags, { Name = "shoplite-igw" })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.shoplite.id
  cidr_block              = local.public_subnet_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, { Name = "shoplite-public" })
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.shoplite.id
  cidr_block        = local.private_subnet_cidr
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = merge(local.common_tags, { Name = "shoplite-private" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.shoplite.id
  tags   = merge(local.common_tags, { Name = "shoplite-public" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.shoplite.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(local.common_tags, { Name = "shoplite-nat-eip" })
}

resource "aws_nat_gateway" "shoplite" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public.id

  depends_on = [aws_internet_gateway.shoplite]
  tags       = merge(local.common_tags, { Name = "shoplite-nat" })
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.shoplite.id
  tags   = merge(local.common_tags, { Name = "shoplite-private" })
}

resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.shoplite.id
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "edge" {
  name        = "shoplite-edge"
  description = "Public HTTP entry and restricted SSH administration."
  vpc_id      = aws_vpc.shoplite.id
  tags        = merge(local.common_tags, { Name = "shoplite-edge" })
}

resource "aws_security_group" "backend" {
  name        = "shoplite-backend"
  description = "API access only from the edge host."
  vpc_id      = aws_vpc.shoplite.id
  tags        = merge(local.common_tags, { Name = "shoplite-backend" })
}

resource "aws_security_group" "database" {
  name        = "shoplite-database"
  description = "PostgreSQL access only from the backend host."
  vpc_id      = aws_vpc.shoplite.id
  tags        = merge(local.common_tags, { Name = "shoplite-database" })
}

resource "aws_vpc_security_group_ingress_rule" "edge_http" {
  security_group_id = aws_security_group.edge.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "Public ShopLite HTTP entry."
}

resource "aws_vpc_security_group_ingress_rule" "edge_ssh" {
  security_group_id = aws_security_group.edge.id
  cidr_ipv4         = var.ssh_cidr
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
  description       = "SSH from the administrator's fixed IP."
}

resource "aws_vpc_security_group_ingress_rule" "backend_api" {
  security_group_id            = aws_security_group.backend.id
  referenced_security_group_id = aws_security_group.edge.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "API requests from host Nginx on EC2-1."
}

resource "aws_vpc_security_group_ingress_rule" "backend_ssh" {
  security_group_id            = aws_security_group.backend.id
  referenced_security_group_id = aws_security_group.edge.id
  from_port                    = 22
  to_port                      = 22
  ip_protocol                  = "tcp"
  description                  = "SSH via EC2-1 jump host."
}

resource "aws_vpc_security_group_ingress_rule" "database_postgres" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.backend.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL from the backend only."
}

resource "aws_vpc_security_group_ingress_rule" "database_ssh" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.edge.id
  from_port                    = 22
  to_port                      = 22
  ip_protocol                  = "tcp"
  description                  = "SSH via EC2-1 jump host."
}

resource "aws_vpc_security_group_egress_rule" "edge_web" {
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.edge.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  ip_protocol       = "tcp"
  description       = "HTTP/S package and public image downloads."
}

resource "aws_vpc_security_group_egress_rule" "edge_dns" {
  for_each = toset(["tcp", "udp"])

  security_group_id = aws_security_group.edge.id
  cidr_ipv4         = local.vpc_cidr
  from_port         = 53
  to_port           = 53
  ip_protocol       = each.value
  description       = "VPC DNS resolution."
}

resource "aws_vpc_security_group_egress_rule" "edge_to_backend" {
  security_group_id            = aws_security_group.edge.id
  referenced_security_group_id = aws_security_group.backend.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "Proxy API traffic to EC2-2."
}

resource "aws_vpc_security_group_egress_rule" "backend_web" {
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.backend.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  ip_protocol       = "tcp"
  description       = "HTTP/S package and public image downloads through NAT."
}

resource "aws_vpc_security_group_egress_rule" "backend_dns" {
  for_each = toset(["tcp", "udp"])

  security_group_id = aws_security_group.backend.id
  cidr_ipv4         = local.vpc_cidr
  from_port         = 53
  to_port           = 53
  ip_protocol       = each.value
  description       = "VPC DNS resolution."
}

resource "aws_vpc_security_group_egress_rule" "backend_to_database" {
  security_group_id            = aws_security_group.backend.id
  referenced_security_group_id = aws_security_group.database.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Database connections from the API host."
}

resource "aws_vpc_security_group_egress_rule" "database_web" {
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.database.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  ip_protocol       = "tcp"
  description       = "HTTP/S package and public image downloads through NAT."
}

resource "aws_vpc_security_group_egress_rule" "database_dns" {
  for_each = toset(["tcp", "udp"])

  security_group_id = aws_security_group.database.id
  cidr_ipv4         = local.vpc_cidr
  from_port         = 53
  to_port           = 53
  ip_protocol       = each.value
  description       = "VPC DNS resolution."
}

resource "aws_instance" "edge" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  private_ip                  = local.edge_private_ip
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.edge.id]
  key_name                    = var.key_name
  user_data = templatefile("${path.module}/templates/edge-user-data.sh.tftpl", {
    frontend_image     = var.frontend_image
    backend_private_ip = local.backend_private_ip
    nginx_config = templatefile("${path.module}/../../deploy/nginx/shoplite.conf.tftpl", {
      backend_private_ip = local.backend_private_ip
    })
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_size           = 16
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.common_tags, { Name = "shoplite-ec2-1-edge" })
}

resource "aws_instance" "backend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.private.id
  private_ip             = local.backend_private_ip
  vpc_security_group_ids = [aws_security_group.backend.id]
  key_name               = var.key_name
  user_data = templatefile("${path.module}/templates/backend-user-data.sh.tftpl", {
    backend_image       = var.backend_image
    backend_private_ip  = local.backend_private_ip
    database_private_ip = local.database_private_ip
    db_password         = var.db_password
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_size           = 16
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.common_tags, { Name = "shoplite-ec2-2-backend" })
}

resource "aws_instance" "database" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.private.id
  private_ip             = local.database_private_ip
  vpc_security_group_ids = [aws_security_group.database.id]
  key_name               = var.key_name
  user_data = templatefile("${path.module}/templates/database-user-data.sh.tftpl", {
    database_private_ip = local.database_private_ip
    db_password         = var.db_password
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_size           = 24
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.common_tags, { Name = "shoplite-ec2-3-database" })
}
