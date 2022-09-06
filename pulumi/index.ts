import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as fs from "fs";

const appLabels = {"k8s-app": "metricbeat"};

const configMap = new k8s.core.v1.ConfigMap("metricbeat-daemonset-config", {
    metadata: {
        name: "metricbeat-daemonset-config",
        namespace: "monitoring",
    },
    data: {
        "metricbeat.yml": fs.readFileSync('metricbeat.yml').toString(),
    },
});

const configMapModules = new k8s.core.v1.ConfigMap("metricbeat-daemonset-modules", {
    metadata: {
        name: "metricbeat-daemonset-modules",
        namespace: "monitoring",
    },
    data: {
        "system.yml": fs.readFileSync('system.yml').toString(),
        "kubernetes.yml": fs.readFileSync('kubernetes.yml').toString(),
    },
});


// Create a DaemonSet
const metricbeat = new k8s.apps.v1.DaemonSet("metricbeat", {
    metadata: {
        name: "metricbeat",
        namespace: "monitoring",
        labels: appLabels,
    },
    spec: {
        selector: {
            matchLabels: appLabels,
        },
        template: {
            metadata: {
                labels: appLabels,
            },
            spec: {
                serviceAccountName: "metricbeat",
                terminationGracePeriodSeconds: 30,
                hostNetwork: true,
                dnsPolicy: "ClusterFirstWithHostNet",
                containers: [
                    {
                        name: "metricbeat",
                        image: "docker.elastic.co/beats/metricbeat:7.13.0",
                        args: [
                            "-c", "/etc/metricbeat.yml",
                            "-e",
                            "-system.hostfs=/hostfs",
                        ],
                        env: [
                            {
                                name: "ELASTICSEARCH_HOST",
                                value: "elasticsearch.monitoring",
                            },
                            {
                                name: "ELASTICSEARCH_PORT",
                                value: "9200",
                            },
                            {
                                name: "ELASTICSEARCH_USERNAME",
                                value: "elastic",
                            },
                            {
                                name: "ELASTICSEARCH_PASSWORD",
                                value: "changeme",
                            },
                            {
                                name: "NODE_NAME",
                                valueFrom: {
                                    fieldRef: {
                                        fieldPath: "spec.nodeName",
                                    },
                                },
                            },
                        ],
                        securityContext: {
                            runAsUser: 0,
                            // If using Red Hat OpenShift uncomment this:
                            //privileged: true
                        },
                        resources: {
                            limits: {
                                memory: "200Mi",
                            },
                            requests: {
                                cpu: "100m",
                                memory: "100Mi",
                            },
                        },
                        volumeMounts: [
                            {
                                name: "config",
                                mountPath: "/etc/metricbeat.yml",
                                readOnly: true,
                                subPath: "metricbeat.yml",
                            },
                            {
                                name: "data",
                                mountPath: "/usr/share/metricbeat/data",
                            },
                            {
                                name: "modules",
                                mountPath: "/usr/share/metricbeat/modules.d",
                                readOnly: true,
                            },
                            {
                                name: "proc",
                                mountPath: "/hostfs/proc",
                                readOnly: true,
                            },
                            {
                                name: "cgroup",
                                mountPath: "/hostfs/sys/fs/cgroup",
                                readOnly: true,
                            },
                        ],
                    },
                ],
                volumes: [
                    {
                        name: "proc",
                        hostPath: {
                            path: "/proc",
                        },
                    },
                    {
                        name: "cgroup",
                        hostPath: {
                            path: "/sys/fs/cgroup",
                        },
                    },
                    {
                        name: "config",
                        configMap: {
                            defaultMode: 416,
                            name: "metricbeat-daemonset-config",
                        },
                    },
                    {
                        name: "modules",
                        configMap: {
                            defaultMode: 416,
                            name: "metricbeat-daemonset-modules",
                        },
                    },
                    {
                        name: "data",
                        hostPath: {
                            // When metricbeat runs as non-root user, this directory needs to be writable by group (g+w)
                            path: "/var/lib/metricbeat-data",
                            type: "DirectoryOrCreate",
                        },
                    },
                ],
            },
        },
    },
});


// Create a ClusterRoleBinding
const metricbeatClusterRoleBinding = new k8s.rbac.v1.ClusterRoleBinding("metricbeat", {
    metadata: {
        name: "metricbeat",
    },
    subjects: [
        {
            kind: "ServiceAccount",
            name: "metricbeat",
            namespace: "monitoring",
        },
    ],
    roleRef: {
        kind: "ClusterRole",
        name: "metricbeat",
        apiGroup: "rbac.authorization.k8s.io",
    },
});


// Create a ClusterRole
const metricbeatClusterRole = new k8s.rbac.v1.ClusterRole("metricbeat", {
    metadata: {
        name: "metricbeat",
        labels: appLabels,
    },
    rules: [
        {
            apiGroups: [""],
            resources: [
                "nodes",
                "namespaces",
                "events",
                "pods",
                "services",
            ],
            verbs: ["get", "list", "watch"],
        },
        {
            apiGroups: ["extensions"],
            resources: [
                "replicasets",
            ],
            verbs: ["get", "list", "watch"],
        },
        {
            apiGroups: ["apps"],
            resources: [
                "statefulsets",
                "deployments",
                "replicasets",
            ],
            verbs: ["get", "list", "watch"],
        },
        {
            apiGroups: [""],
            resources: [
                "nodes/stats",
            ],
            verbs: ["get"],
        },
        {
            nonResourceURLs: [
                "/metrics",
            ],
            verbs: ["get"],
        },
        {
            apiGroups: [
                "coordination.k8s.io",
            ],
            resources: [
                "leases",
            ],
            verbs: ["*"],
        },
    ],
});


// Create a ServiceAccount
const metricbeatServiceAccount = new k8s.core.v1.ServiceAccount("metricbeat", {
    metadata: {
        name: "metricbeat",
        namespace: "monitoring",
        labels: appLabels,
    },
});


export const name = "metricbeat";
