package sumpf.web.backend.entity;

import jakarta.persistence.*;

import java.util.List;

@Entity
public class Member {

    @GeneratedValue
    @Id
    private Integer id;

    private String name;

    @OneToMany(mappedBy = "member", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TeamMember> teamMemberList;
}
