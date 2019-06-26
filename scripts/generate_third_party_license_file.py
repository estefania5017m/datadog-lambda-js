import csv
import json
import re
import shlex
import subprocess

REPO_EXCEPTIONS = {"eyes": "https://github.com/cloudhead/eyes.js"}


def get_repo_url(dep_name, dep_meta):
    repo_url = dep_meta.get("repository", REPO_EXCEPTIONS.get(dep_name, "NO REPO"))
    if repo_url.startswith("https"):
        return re.search(r"https:\/\/(.*)", repo_url).group(1)
    return repo_url


if __name__ == "__main__":
    raw_output = subprocess.check_output(
        shlex.split("license-checker --json --production")
    )
    deps = json.loads(raw_output)
    alphabetized_dep_names = sorted(deps.keys())

    formatted_deps = []
    for dep in alphabetized_dep_names:
        dep_meta = deps[dep]
        dep_name = re.search(r"([\w-]+)@", dep).group(1)
        repo_url = get_repo_url(dep_name, dep_meta)
        license_file = dep_meta.get("licenseFile", "")

        # Extract the "Copyright ..." line from the license file
        # TODO: handle multi-line licenses (example: https://github.com/tim-kos/node-retry/blob/master/License)
        # TODO: fix this case: github.com/beatgammit/base64-js
        if license_file:
            with open(license_file) as f:
                matches = [line for line in f if re.match(r"Copyright ", line)]
                if len(matches) > 0:
                    dep_copyright = matches[0].strip()

        formatted_deps.append(
            {
                "Component": dep_name,
                "Origin": repo_url,
                "License": dep_meta.get("licenses", "LICENSE NOT FOUND"),
                "Copyright": dep_copyright,
            }
        )

    with open("LICENSE-3rdparty.csv", "w") as csv_file:
        fieldnames = ["Component", "Origin", "License", "Copyright"]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for dep in formatted_deps:
            writer.writerow(dep)
