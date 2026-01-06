variable "domain_name" {
  description = "The domain name for the website"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

