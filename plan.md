# ShopLite Assignment Plan

## Problem and approach

Build a complete, assignment-ready repository for deploying ShopLite as a containerized three-tier application on AWS EC2. The frontend will be a dynamic React application, the API will use Node.js/Express, and PostgreSQL will persist product data. Terraform will provision the AWS network and instances. The deployment design must keep the database private and pull all application images from Docker Hub rather than copying or building source on EC2.

## Todos

1. Implement a React product catalog UI that lists products and submits new products to the API.
2. Implement a Node.js/Express REST API backed by PostgreSQL, with configuration supplied through environment variables.
3. Add separate frontend/backend Dockerfiles and document publishing version-tagged images to public Docker Hub repositories.
4. Define Terraform for a VPC, public/private subnets, EC2 instances, routing, and least-privilege security groups; keep the database host private.
5. Add deployment assets and instructions for manually installed host Nginx, user-defined Docker networks, database named volume, private API-to-database connectivity, and restart/reboot persistence.
6. Expand README with architecture, setup, deployment, validation, teardown/cost guidance, screenshot placeholders, and answers to Q1–Q5.

## Notes and considerations

- Do not create AWS resources or publish images as part of repository implementation.
- Do not place application source on EC2 or build application images there; EC2 deployment pulls explicit version tags from Docker Hub.
- Terraform should use configurable values and avoid committing credentials or state.
- The database must have no public IP and must not accept internet-originated database traffic.
- Real deployment screenshots must be captured by the user; placeholders and instructions can be committed.
- Remind the user to destroy resources after evaluation to avoid charges.
