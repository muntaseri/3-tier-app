# ShopLite: Containerized 3-Tier Application on AWS EC2

ShopLite is a product catalogue with a dynamic React frontend, a Node.js/Express REST API, and PostgreSQL. It is designed for three Ubuntu EC2 instances in one VPC. Terraform provisions the infrastructure; Docker Hub hosts the frontend and backend images.

> **Assignment safety requirement:** PostgreSQL runs on a private EC2 instance with no public IP. Do not add a public database ingress rule. The EC2 instances pull prebuilt, version-tagged application images; no application source is copied to or built on an EC2 instance.

## Architecture

```text
Browser
  | HTTP :80
  v
EC2-1 (public subnet; public IP)
  Host Nginx :80
  ├── /       -> React container at 127.0.0.1:8080
  └── /api/*  -> EC2-2 private IP :3000
                       |
                       v
              EC2-2 (private subnet; no public IP)
              Node.js API container :3000
                       |
                       | PostgreSQL :5432 over VPC private IPs
                       v
              EC2-3 (private subnet; no public IP)
              PostgreSQL container + named Docker volume
```

Each host creates its own user-defined Docker network. Docker networks are host-local; EC2-2 reaches PostgreSQL using EC2-3's private IP. A NAT Gateway provides outbound-only access for private hosts to install OS updates and pull public Docker Hub images. It does not expose the database to inbound internet connections.

## Repository layout

```text
backend/                 Express API, tests, and backend Dockerfile
frontend/                React + Vite application and frontend Dockerfile
deploy/nginx/            Host Nginx configuration template
infra/terraform/         VPC, EC2, routing, security groups, and bootstrap
```

## Run locally

Requirements: Docker and Docker Compose.

```sh
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The compose setup starts PostgreSQL with a named volume, the API, and the React app. API requests go through the frontend's local Nginx proxy, matching the single-origin production setup.

Run backend unit tests without Docker:

```sh
cd backend
npm ci
npm test
```

## API

The browser uses the same-origin API paths through Nginx:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Check API and database connectivity |
| `GET` | `/api/products` | List products, newest first |
| `POST` | `/api/products` | Add a product with `name`, optional `description`, and positive numeric `price` |

Example request:

```sh
curl -X POST http://localhost:8080/api/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Handwoven tote","description":"Made in Dhaka","price":1250}'
```

## Build and publish versioned Docker Hub images

Create public Docker Hub repositories named `shoplite-frontend` and `shoplite-backend`. Replace `YOUR_DOCKERHUB_USERNAME` with your own username. Choose a new version for each release; do not rely on the `latest` tag.

```sh
docker login
docker buildx build --platform linux/amd64 \
  -t YOUR_DOCKERHUB_USERNAME/shoplite-frontend:v1.0.0 \
  --push ./frontend
docker buildx build --platform linux/amd64 \
  -t YOUR_DOCKERHUB_USERNAME/shoplite-backend:v1.0.0 \
  --push ./backend
```

The Dockerfiles use runtime-only images/artifacts. Docker Hub images must be public so EC2 can pull them without storing registry credentials.

## Deploy to AWS

### 1. Prerequisites

- An AWS account and AWS CLI credentials configured locally.
- Terraform 1.5+ and an EC2 key pair already created in the target region.
- The two public, version-tagged Docker Hub images built above.
- A known public IPv4 CIDR for SSH administration, such as `203.0.113.10/32`. Do not use `0.0.0.0/0` for SSH.

Terraform creates a VPC, one public subnet, one private subnet, an internet gateway, a NAT Gateway, three EC2 instances, and security groups. The private subnet has a default route through NAT for outbound package/image downloads; it has no inbound internet route. The database instance has no public IP.

### 2. Configure Terraform

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

- Set `aws_region`, `key_name`, and your restricted `ssh_cidr`.
- Set the exact version-tagged image names from your public Docker Hub repositories.
- Set a unique `db_password` with at least 16 characters, using letters, digits, `_`, or `-`.

The password is marked sensitive but is included in Terraform state and EC2 user data so the backend can connect to PostgreSQL. Keep state local and access-restricted, never commit `terraform.tfvars`, state, plans, or user-data output. For a shared deployment, use an encrypted, access-controlled remote state backend and a secret-management design. Changing `db_password` through Terraform replaces the database instance; back up and plan a coordinated credential rotation before changing it because the database volume is attached to that instance.

```sh
terraform init
terraform validate
terraform plan
terraform apply
```

Save the `frontend_public_ip`, `backend_private_ip`, and `database_private_ip` outputs. Bootstrap installs Docker on all hosts. EC2-1 installs Nginx directly on Ubuntu (not in a container), configures it from [`deploy/nginx/shoplite.conf.tftpl`](deploy/nginx/shoplite.conf.tftpl), and runs the frontend image. EC2-2 runs the API image. EC2-3 runs PostgreSQL with the named volume `shoplite-postgres-data`.

### 3. Verify

Visit `http://FRONTEND_PUBLIC_IP/`. Add a product and refresh the page; the product should remain. Check API/database readiness:

```sh
curl http://FRONTEND_PUBLIC_IP/api/health
curl http://FRONTEND_PUBLIC_IP/api/products
```

The health endpoint returns `200` only when the API can query PostgreSQL. A `503` indicates the API is up but the database is not ready or reachable.

For administration, SSH to EC2-1 from the allowed CIDR and use it as a jump host to reach the private instances:

```sh
ssh -i /path/to/your-key.pem ubuntu@FRONTEND_PUBLIC_IP
ssh -i /path/to/your-key.pem -J ubuntu@FRONTEND_PUBLIC_IP ubuntu@BACKEND_PRIVATE_IP
ssh -i /path/to/your-key.pem -J ubuntu@FRONTEND_PUBLIC_IP ubuntu@DATABASE_PRIVATE_IP
```

On each host, the `shoplite-net` user-defined Docker network is created. Inspect status with `sudo docker ps` and `sudo docker network inspect shoplite-net`. On EC2-3, confirm persistence with `sudo docker volume inspect shoplite-postgres-data`.

### 4. Update or roll back an application image

Publish a new immutable version tag. To deploy it, update the corresponding image variable in `terraform.tfvars` and apply; Terraform replaces only the app host whose user data changed, keeping the backend's private IP fixed. Alternatively, SSH to the relevant host and pull/recreate only that application container with the new explicit tag. On EC2-2, `/etc/shoplite/backend.env` is a root-readable environment file for container recreation. For a rollback, pull and run the previous known-good tag with the same container name, `shoplite-net` network, private-IP port binding, environment file, and restart policy. The database volume is independent of the API container and must not be deleted during an application rollback.

### 5. Destroy resources

After evaluation, destroy the infrastructure to avoid continuing EC2, NAT Gateway, and data-transfer charges:

```sh
cd infra/terraform
terraform destroy
```

Terraform deletion removes the EC2 instances and their local Docker data, including the database volume. Back up any data you need before destroying the instances.

## Security group design

| Instance / group | Inbound allowed | Reason |
|---|---|---|
| EC2-1 edge | TCP 80 from `0.0.0.0/0`; TCP 22 only from `ssh_cidr` | Public web entry point; restricted administration |
| EC2-2 backend | TCP 3000 only from EC2-1 security group; TCP 22 only from EC2-1 security group | API is reachable only through the edge host; administration via jump host |
| EC2-3 database | TCP 5432 only from EC2-2 security group; TCP 22 only from EC2-1 security group | PostgreSQL is reachable only from the backend; administration via jump host |

Security groups are stateful. No inbound database rule references a public CIDR. Private EC2 instances have no public IP. Docker publishes PostgreSQL only on EC2-3's private address, not `0.0.0.0`.

## Assignment scenario questions

### Q1. Page loads, but product list is empty and API calls return 502

Start at the failing boundary and move inward. In the browser's network panel, inspect the failing `/api` URL and response. On EC2-1, check `sudo nginx -t`, `sudo systemctl status nginx`, and `sudo tail -n 100 /var/log/nginx/error.log`; verify the Nginx upstream points to EC2-2's current private IP. From EC2-1, test `curl http://BACKEND_PRIVATE_IP:3000/api/health`. On EC2-2, inspect `sudo docker ps`, `sudo docker logs shoplite-backend`, the `shoplite-net` network, and the container's DB host, username, database, and password settings. From EC2-2, test the database's private IP on port 5432. On EC2-3, check the PostgreSQL container, logs, volume, and free disk space. Confirm security-group rules allow only edge-to-backend and backend-to-database traffic. Fix the specific broken hop, then recheck health and products through the public URL; do not expose PostgreSQL to troubleshoot.

### Q2. How can EC2-3 receive OS patches without breaking the database security rule?

The private subnet routes outbound traffic through the NAT Gateway. An administrator connects through the restricted EC2-1 jump host and runs the OS package manager on EC2-3:

```sh
ssh -i /path/to/your-key.pem -J ubuntu@FRONTEND_PUBLIC_IP ubuntu@DATABASE_PRIVATE_IP
sudo apt-get update && sudo apt-get upgrade -y
```

The instance initiates HTTPS connections to package repositories through NAT. NAT allows return traffic for those outbound connections but does not permit unsolicited internet-initiated database connections. The database security group remains restricted to EC2-2 on port 5432.

### Q3. New backend release breaks product creation; rollback required within two minutes

Keep the previous image tag available and immutable. On EC2-2, pull the previous image and recreate only the API container with its existing environment settings, Docker network, and restart policy:

```sh
sudo docker pull YOUR_DOCKERHUB_USERNAME/shoplite-backend:v1.0.0
sudo docker rm -f shoplite-backend
sudo docker run -d \
  --name shoplite-backend \
  --network shoplite-net \
  --restart unless-stopped \
  -p 10.20.2.20:3000:3000 \
  --env-file /etc/shoplite/backend.env \
  YOUR_DOCKERHUB_USERNAME/shoplite-backend:v1.0.0
```

Replace `v1.0.0` with the previous known-good tag. The database container and named volume remain untouched. Verify `/api/health`, list products, and test a new product through EC2-1. For a repeatable release process, maintain the exact image tags and deployment parameters for the current and prior release; never use `latest` as the rollback reference.

### Q4. Teammate opens PostgreSQL to `0.0.0.0/0`

Anyone on the internet could attempt to connect to PostgreSQL, exploit weak or leaked credentials, enumerate data, or consume database resources. The design prevents this by keeping EC2-3 in a private subnet with no public IP and defining database ingress only from the backend security group. Terraform makes that rule reviewable and repeatable; restrict who can change and apply infrastructure, review plans, and continuously inspect security-group drift. If an open rule is discovered, remove it immediately, check database logs and credentials for evidence of access, and rotate credentials if exposure cannot be ruled out.

### Q5. Traffic grows 10 times: what fails first and how should the design change?

The single API instance is likely to saturate first because every request and database operation passes through it; the single PostgreSQL instance and its connection capacity may become the next bottleneck. Measure CPU, memory, request latency, connection counts, and database I/O before changing capacity. Then run multiple API instances behind a load balancer, make API instances stateless, add health checks and controlled rollout, and size or partition database capacity based on measured load. If the assignment's no-managed-database constraint still applies, consider a carefully operated PostgreSQL primary/replica or sharding only when justified; otherwise a managed database and managed load balancer would reduce operational risk. Add caching for read-heavy catalogue traffic and static asset caching/CDN as appropriate.

## Screenshots to add before submission

Real deployment screenshots cannot be captured until you deploy into your own AWS account. Add genuine screenshots under `docs/screenshots/` and embed them here before submitting. Recommended evidence:

1. `architecture.png` — your deployed architecture or Terraform resources.
2. `shoplite-products.png` — browser showing products and a newly added product.
3. `private-database.png` — EC2-3 details showing no public IPv4 address and its restricted database security-group rule.
4. `docker-containers.png` — running containers and the named database volume.

Do not include account credentials, access keys, private keys, passwords, or other secrets in screenshots.
